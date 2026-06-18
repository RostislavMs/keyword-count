import { NextResponse } from "next/server";
import { analyze, extractDocId, parseKeywords } from "@/lib/keywords";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некоректний запит." }, { status: 400 });
  }

  const { docUrl, keywordsRaw, caseSensitive, toleranceMode, toleranceValue } =
    (body ?? {}) as {
      docUrl?: string;
      keywordsRaw?: string;
      caseSensitive?: boolean;
      toleranceMode?: "percent" | "absolute";
      toleranceValue?: number;
    };

  if (!docUrl || typeof docUrl !== "string") {
    return NextResponse.json(
      { error: "Вкажіть посилання на Google-документ." },
      { status: 400 },
    );
  }

  if (docUrl.includes("/document/d/e/")) {
    return NextResponse.json(
      {
        error:
          "Це посилання «Опубліковано в інтернеті». Скопіюйте звичайне посилання спільного доступу (кнопка «Поділитися» → «Будь-хто, хто має посилання»).",
      },
      { status: 400 },
    );
  }

  const id = extractDocId(docUrl);
  if (!id) {
    return NextResponse.json(
      { error: "Не вдалося розпізнати ID документа в посиланні." },
      { status: 400 },
    );
  }

  const exportUrl = `https://docs.google.com/document/d/${id}/export?format=txt`;

  let text = "";
  try {
    const res = await fetch(exportUrl, { redirect: "follow" });
    const contentType = res.headers.get("content-type") ?? "";
    text = await res.text();

    if (!res.ok) {
      return NextResponse.json(
        { error: `Не вдалося завантажити документ (HTTP ${res.status}).` },
        { status: 502 },
      );
    }

    if (
      contentType.includes("text/html") ||
      /^\s*(<!DOCTYPE html|<html[\s>])/i.test(text)
    ) {
      return NextResponse.json(
        {
          error:
            "Документ недоступний публічно. Увімкніть доступ «Будь-хто, хто має посилання» і спробуйте ще раз.",
        },
        { status: 403 },
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Помилка під час завантаження документа." },
      { status: 502 },
    );
  }

  const { items, warnings } = parseKeywords(
    typeof keywordsRaw === "string" ? keywordsRaw : "",
  );

  if (items.length === 0) {
    return NextResponse.json(
      {
        error:
          "Не знайдено жодного ключового слова. Вставте дві колонки: ключ і кількість.",
      },
      { status: 400 },
    );
  }

  const mode = toleranceMode === "absolute" ? "absolute" : "percent";
  const rawValue =
    typeof toleranceValue === "number" && toleranceValue > 0
      ? toleranceValue
      : 0;
  const tolerance = mode === "absolute" ? rawValue : rawValue / 100;

  const results = analyze(text, items, {
    caseSensitive: !!caseSensitive,
    tolerance,
    toleranceMode: mode,
  });
  // Відповідь розбита на дві: окремо те, що треба збільшити, і те — зменшити.
  const increaseOutput = results
    .filter((r) => r.status === "increase")
    .map((r) => r.line)
    .join("\n");
  const reduceOutput = results
    .filter((r) => r.status === "reduce")
    .map((r) => r.line)
    .join("\n");

  const wordCount = (text.match(/\S+/g) ?? []).length;

  return NextResponse.json({
    results,
    increaseOutput,
    reduceOutput,
    warnings,
    charCount: text.length,
    wordCount,
  });
}
