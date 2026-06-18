// Логіка розбору ключових слів і підрахунку точних входжень у тексті.

export interface KeywordSpec {
  keyword: string;
  /** Нижня межа цілі (для одного числа min === max). */
  min: number;
  /** Верхня межа цілі. */
  max: number;
  /** Як ціль показувати: "5" або "10-15". */
  target: string;
}

export type Status = "increase" | "reduce" | "ok";

export interface AnalysisResult {
  keyword: string;
  target: string;
  found: number;
  status: Status;
  /** Рядок у форматі, який просив користувач: `keyword - increase to N`. */
  line: string;
}

export interface CountOptions {
  caseSensitive?: boolean;
  /**
   * Ігнорувати діакритику: "casinò" і "casino" вважати одним словом
   * (італійські акценти, шведські å/ä/ö тощо). Стандартно увімкнено.
   */
  ignoreDiacritics?: boolean;
}

export interface AnalyzeOptions extends CountOptions {
  /**
   * Допустима розбіжність. Для режиму "percent" — частка (0.1 = 10%),
   * для "absolute" — абсолютна кількість (напр. 3).
   */
  tolerance?: number;
  toleranceMode?: "percent" | "absolute";
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Прибирає діакритичні знаки (акценти, умляути): "casinò" → "casino",
 * "Malmö" → "Malmo". Працює через Unicode-нормалізацію NFD — символ
 * розкладається на базову літеру + комбінований знак, який ми відкидаємо.
 */
function foldDiacritics(s: string): string {
  return s.normalize("NFD").replace(/\p{M}+/gu, "");
}

/**
 * Рахує точні входження ключа: ціле слово / точна фраза.
 * Межі слова визначаються через Unicode-літери та цифри (працює з кирилицею),
 * тому "робота" НЕ зараховується всередині "роботи" чи "роботодавець".
 */
export function countOccurrences(
  text: string,
  keyword: string,
  opts: CountOptions = {},
): number {
  const kw = keyword.trim();
  if (!kw) return 0;

  // Стандартно прирівнюємо літери з акцентами до базових (NFD-фолдинг),
  // щоб "casinò" і "casino" рахувалися як одне слово.
  const fold = opts.ignoreDiacritics !== false;
  const haystack = fold ? foldDiacritics(text) : text;
  const needle = fold ? foldDiacritics(kw) : kw;

  // Екрануємо спецсимволи, внутрішні пробіли робимо гнучкими (\s+).
  const escaped = escapeRegExp(needle).replace(/\s+/g, "\\s+");
  const flags = opts.caseSensitive ? "gu" : "giu";
  // Межа слова враховує також дефіс і підкреслення, тому "Pay N Play" не
  // зараховується всередині складеного "Pay N Play-lösningar".
  const pattern = `(?<![\\p{L}\\p{N}_-])(?:${escaped})(?![\\p{L}\\p{N}_-])`;

  let re: RegExp;
  try {
    re = new RegExp(pattern, flags);
  } catch {
    // Запасний варіант, якщо середовище не підтримує lookbehind.
    re = new RegExp(`(?:${escaped})`, flags);
  }

  const matches = haystack.match(re);
  return matches ? matches.length : 0;
}

/**
 * Розбирає текст цілі: одне число ("5") або діапазон ("10-15", "10 – 15").
 * Повертає null, якщо це не кількість.
 */
function parseCount(
  raw: string,
): { min: number; max: number; target: string } | null {
  const s = raw.trim();

  // Дозволяємо примітку в дужках після числа: "1(as part of anchor text)".
  const range = s.match(/^(\d+)\s*[-–—]\s*(\d+)(?:\s*\(.*\))?\s*$/);
  if (range) {
    let a = parseInt(range[1], 10);
    let b = parseInt(range[2], 10);
    if (a > b) [a, b] = [b, a];
    return { min: a, max: b, target: `${a}-${b}` };
  }

  const single = s.match(/^(\d+)(?:\s*\(.*\))?\s*$/);
  if (single) {
    const n = parseInt(single[1], 10);
    return { min: n, max: n, target: String(n) };
  }

  return null;
}

// Ключ і кількість в одному рядку: розділені табуляцією, комою/крапкою з комою
// або 2+ пробілами (вирівнювання колонок). Одинарний пробіл НЕ вважається
// роздільником, щоб не ламати ключі на кшталт "топ 10".
const INLINE =
  /^(.+?)\s*(?:\t+|[,;]+|\s{2,})\s*(\d+(?:\s*[-–—]\s*\d+)?(?:\s*\(.*\))?)\s*$/u;

/**
 * Розбирає вставлені ключі. Підтримує два формати (можна змішувати):
 *  - ключ і кількість в одному рядку (TAB / кома / 2+ пробіли);
 *  - ключ і кількість на сусідніх рядках (ключ зверху, число знизу).
 * Кількість — одне число або діапазон.
 */
export function parseKeywords(raw: string): {
  items: KeywordSpec[];
  warnings: string[];
} {
  const items: KeywordSpec[] = [];
  const warnings: string[] = [];
  let pendingKeyword: string | null = null;

  const flushPending = () => {
    if (pendingKeyword !== null) {
      warnings.push(
        `Для "${pendingKeyword}" не вказано кількість — ціль прийнято за 0`,
      );
      items.push({ keyword: pendingKeyword, min: 0, max: 0, target: "0" });
      pendingKeyword = null;
    }
  };

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    // 1) Рядок повністю є числом/діапазоном.
    const count = parseCount(line);
    if (count) {
      if (pendingKeyword !== null) {
        // Число одразу після ключа — це його кількість.
        items.push({ keyword: pendingKeyword, ...count });
        pendingKeyword = null;
      } else {
        // Число без підвішеного ключа — це САМ ключ (напр. рік 2025, 2026).
        pendingKeyword = line;
      }
      continue;
    }

    // 2) Ключ + кількість в одному рядку (TAB / кома / 2+ пробіли).
    const inline = line.match(INLINE);
    if (inline) {
      const inlineCount = parseCount(inline[2]);
      if (inlineCount) {
        flushPending();
        items.push({ keyword: inline[1].trim(), ...inlineCount });
        continue;
      }
    }

    // 3) Інакше це рядок із ключовим словом.
    flushPending();
    pendingKeyword = line.replace(/\t+/g, " ").trim();
  }

  flushPending();
  return { items, warnings };
}

export function analyze(
  text: string,
  items: KeywordSpec[],
  opts: AnalyzeOptions = {},
): AnalysisResult[] {
  const tol = Math.max(0, opts.tolerance ?? 0);
  const absolute = opts.toleranceMode === "absolute";

  return items.map(({ keyword, min, max, target }) => {
    const found = countOccurrences(text, keyword, opts);

    // Толеранс розширює допустимий діапазон на обидва боки:
    // у відсотках (множник) або абсолютним числом.
    const lowBound = absolute ? min - tol : min * (1 - tol);
    const highBound = absolute ? max + tol : max * (1 + tol);

    let status: Status;
    let line: string;
    if (found < lowBound) {
      status = "increase";
      line = `${keyword} - increase to ${target}`;
    } else if (found > highBound) {
      status = "reduce";
      line = `${keyword} - reduce to ${target}`;
    } else {
      status = "ok";
      line = `${keyword} - ok (${target})`;
    }

    return { keyword, target, found, status, line };
  });
}

/**
 * Рахує слова й символи так, як це робить лічильник Google Docs
 * (Ctrl+Shift+C), а не «сирий» .txt-експорт, який зазвичай завищує:
 *  - прибираємо BOM на початку файлу;
 *  - прибираємо рядок назви документа, який Google дописує зверху
 *    (сигнатура: перший рядок, далі порожній рядок);
 *  - символи рахуємо БЕЗ переносів рядків — Docs не рахує розриви абзаців
 *    (але пробіли рахуємо, як і головне число в діалозі Docs);
 *  - словом вважаємо лише токен, що містить літеру або цифру, тож маркери
 *    списків і поодинокі «—», «•», «|» не зараховуються.
 */
export function documentStats(rawText: string): {
  wordCount: number;
  charCount: number;
} {
  // 1) BOM на початку експорту.
  let text = rawText.replace(/^﻿/, "");

  // 2) Назва документа першим рядком + порожній рядок під нею.
  const titleBlock = text.match(/^[^\r\n]*\r?\n[ \t]*\r?\n/);
  if (titleBlock) text = text.slice(titleBlock[0].length);

  // 3) Слова — лише токени з хоча б однією літерою/цифрою.
  const tokens = text.match(/\S+/gu) ?? [];
  const wordCount = tokens.filter((t) => /[\p{L}\p{N}]/u.test(t)).length;

  // 4) Символи — усе, крім переносів рядків.
  const charCount = text.replace(/[\r\n]+/g, "").length;

  return { wordCount, charCount };
}

/** Дістає ID Google-документа з посилання або приймає сам ID. */
export function extractDocId(input: string): string | null {
  const s = input.trim();
  if (/^[a-zA-Z0-9_-]{20,}$/.test(s)) return s;

  const m =
    s.match(/\/document\/d\/([a-zA-Z0-9_-]+)/) ||
    s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}
