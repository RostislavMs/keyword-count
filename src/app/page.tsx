"use client";

import { useMemo, useState } from "react";
import type { AnalysisResult, Status } from "@/lib/keywords";

interface ApiResponse {
  results: AnalysisResult[];
  output: string;
  warnings: string[];
  charCount: number;
  wordCount: number;
}

function CopyIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

const STATUS_STYLES: Record<Status, { label: string; cls: string }> = {
  increase: { label: "Додати", cls: "bg-amber-100 text-amber-800" },
  reduce: { label: "Зменшити", cls: "bg-rose-100 text-rose-800" },
  ok: { label: "OK", cls: "bg-emerald-100 text-emerald-800" },
};

const STATUS_RANK: Record<Status, number> = { increase: 0, reduce: 1, ok: 2 };

type SortCol = "found" | "target" | "status";

/** Розбирає "5" або "10-15" у пару [min, max]; null — якщо не число/діапазон. */
function parseRange(s: string): [number, number] | null {
  const t = s.replace(/\s+/g, "");
  const range = t.match(/^(\d+)[-–—](\d+)$/);
  if (range) {
    let a = parseInt(range[1], 10);
    let b = parseInt(range[2], 10);
    if (a > b) [a, b] = [b, a];
    return [a, b];
  }
  const single = t.match(/^(\d+)$/);
  if (single) {
    const n = parseInt(single[1], 10);
    return [n, n];
  }
  return null;
}

const TOLERANCE_OPTIONS = [0, 5, 10, 15, 20, 30, 40, 50];

export default function Home() {
  const [docUrl, setDocUrl] = useState("");
  const [keywordsRaw, setKeywordsRaw] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [toleranceMode, setToleranceMode] = useState<"percent" | "absolute">(
    "percent",
  );
  const [tolerancePercent, setTolerancePercent] = useState(0);
  const [toleranceAbs, setToleranceAbs] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [appliedToleranceLabel, setAppliedToleranceLabel] = useState("0%");
  const [copied, setCopied] = useState(false);
  const [copiedKw, setCopiedKw] = useState<number | null>(null);
  const [sortCol, setSortCol] = useState<SortCol | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [targetFilter, setTargetFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setData(null);
    setCopied(false);

    const toleranceValue =
      toleranceMode === "absolute"
        ? parseInt(toleranceAbs, 10) || 0
        : tolerancePercent;
    const toleranceLabel =
      toleranceMode === "absolute" ? `±${toleranceValue}` : `${toleranceValue}%`;

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docUrl,
          keywordsRaw,
          caseSensitive,
          toleranceMode,
          toleranceValue,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Сталася помилка.");
      } else {
        setData(json as ApiResponse);
        setAppliedToleranceLabel(toleranceLabel);
      }
    } catch {
      setError("Не вдалося звʼязатися із сервером.");
    } finally {
      setLoading(false);
    }
  }

  async function copyOutput() {
    if (!data) return;
    await navigator.clipboard.writeText(data.output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function copyKeyword(keyword: string, i: number) {
    await navigator.clipboard.writeText(keyword);
    setCopiedKw(i);
    setTimeout(() => setCopiedKw(null), 1500);
  }

  function toggleSort(col: SortCol) {
    if (sortCol !== col) {
      setSortCol(col);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else {
      setSortCol(null);
      setSortDir("asc");
    }
  }

  const sortArrow = (col: SortCol) =>
    sortCol === col ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  const rows = useMemo(() => {
    if (!data) return [];
    const arr = data.results.map((r, idx) => ({ ...r, idx }));
    const fr = parseRange(targetFilter);
    const filtered = arr.filter((r) => {
      if (fr) {
        const tr = parseRange(r.target);
        // Показуємо ключ, якщо його діапазон цілі перетинається з фільтром.
        if (!tr || tr[0] > fr[1] || fr[0] > tr[1]) return false;
      }
      return statusFilter === "all" || r.status === statusFilter;
    });
    if (!sortCol) return filtered;
    const dir = sortDir === "asc" ? 1 : -1;
    const value = (r: (typeof arr)[number]) =>
      sortCol === "found"
        ? r.found
        : sortCol === "target"
          ? parseInt(r.target, 10) || 0
          : STATUS_RANK[r.status];
    return [...filtered].sort((a, b) => (value(a) - value(b)) * dir);
  }, [data, sortCol, sortDir, targetFilter, statusFilter]);

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Сайдбар з усіма діями */}
      <aside className="w-full shrink-0 border-b border-neutral-200 bg-white p-5 lg:sticky lg:top-0 lg:h-screen lg:w-96 lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <h1 className="text-lg font-semibold tracking-tight">
          Підрахунок ключових слів
        </h1>
        <p className="mt-1 text-xs text-neutral-500">
          Публічний Google-документ + дві колонки «ключ / кількість».
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Посилання на Google-документ
            </label>
            <input
              type="url"
              required
              value={docUrl}
              onChange={(e) => setDocUrl(e.target.value)}
              placeholder="https://docs.google.com/document/d/.../edit"
              className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Ключові слова (ключ + кількість)
            </label>
            <textarea
              required
              value={keywordsRaw}
              onChange={(e) => setKeywordsRaw(e.target.value)}
              rows={9}
              placeholder={"робота\n5\nпошук талантів\n10-15\nрезюме\n2"}
              className="w-full resize-y rounded-lg border border-neutral-300 bg-white px-3 py-2 font-mono text-sm shadow-sm outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
            />
            <p className="mt-1 text-xs text-neutral-500">
              Ключ і число — на сусідніх рядках або в один рядок через
              табуляцію/кому. Кількість: число (5) або діапазон (10-15).
            </p>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="tolerance" className="text-sm font-medium">
                Допустима розбіжність
              </label>
              <div className="inline-flex overflow-hidden rounded-md border border-neutral-300 text-xs">
                <button
                  type="button"
                  onClick={() => setToleranceMode("percent")}
                  className={`px-2.5 py-1 font-medium transition ${
                    toleranceMode === "percent"
                      ? "bg-neutral-900 text-white"
                      : "bg-white text-neutral-600 hover:bg-neutral-50"
                  }`}
                >
                  %
                </button>
                <button
                  type="button"
                  onClick={() => setToleranceMode("absolute")}
                  className={`border-l border-neutral-300 px-2.5 py-1 font-medium transition ${
                    toleranceMode === "absolute"
                      ? "bg-neutral-900 text-white"
                      : "bg-white text-neutral-600 hover:bg-neutral-50"
                  }`}
                >
                  Число
                </button>
              </div>
            </div>
            {toleranceMode === "percent" ? (
              <select
                id="tolerance"
                value={tolerancePercent}
                onChange={(e) => setTolerancePercent(Number(e.target.value))}
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
              >
                {TOLERANCE_OPTIONS.map((v) => (
                  <option key={v} value={v}>
                    {v === 0 ? "0% (точно)" : `${v}%`}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id="tolerance"
                type="number"
                min={0}
                step={1}
                value={toleranceAbs}
                onChange={(e) => setToleranceAbs(e.target.value)}
                placeholder="напр. 3"
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
              />
            )}
            <p className="mt-1 text-xs text-neutral-500">
              {toleranceMode === "percent"
                ? "Наскільки (у %) можна відхилятися від цілі й вважати нормою."
                : "На скільки одиниць можна відхилятися від цілі (напр. ±3)."}
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              checked={caseSensitive}
              onChange={(e) => setCaseSensitive(e.target.checked)}
              className="h-4 w-4 rounded border-neutral-300"
            />
            Враховувати регістр
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Аналізую…" : "Порахувати"}
          </button>
        </form>
      </aside>

      {/* Головна область з результатами */}
      <main className="flex-1 p-5 sm:p-8">
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        )}

        {!data && !error && (
          <div className="flex h-full min-h-[40vh] items-center justify-center text-center text-sm text-neutral-400">
            Заповніть форму ліворуч і натисніть «Порахувати» — результати
            зʼявляться тут.
          </div>
        )}

        {data && (
          <section className="space-y-6">
            {/* Відповідь — нагорі */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-sm font-medium">Відповідь</label>
                {data.output.trim() && (
                  <button
                    type="button"
                    onClick={copyOutput}
                    className="rounded-md border border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50"
                  >
                    {copied ? "Скопійовано ✓" : "Копіювати"}
                  </button>
                )}
              </div>
              {data.output.trim() ? (
                <textarea
                  readOnly
                  aria-label="Відповідь"
                  value={data.output}
                  rows={Math.min(data.output.split("\n").length + 1, 16)}
                  className="w-full resize-y rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 font-mono text-sm text-neutral-800 outline-none"
                />
              ) : (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  Усе в межах норми — змінювати нічого не треба.
                </div>
              )}
            </div>

            {/* Зведення */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-neutral-500">
              <span>
                Ключів:{" "}
                <strong className="text-neutral-800">
                  {data.results.length}
                </strong>
              </span>
              <span>
                Допустима розбіжність:{" "}
                <strong className="text-neutral-800">
                  {appliedToleranceLabel}
                </strong>
              </span>
              <span>
                Слів у документі:{" "}
                <strong className="text-neutral-800">
                  {data.wordCount.toLocaleString("uk")}
                </strong>
              </span>
              <span>
                Символів у документі:{" "}
                <strong className="text-neutral-800">
                  {data.charCount.toLocaleString("uk")}
                </strong>
              </span>
            </div>

            {data.warnings.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <ul className="list-disc space-y-0.5 pl-4">
                  {data.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Фільтри + таблиця */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <label htmlFor="target-filter" className="text-neutral-500">
                    Ціль:
                  </label>
                  <input
                    id="target-filter"
                    type="text"
                    value={targetFilter}
                    onChange={(e) => setTargetFilter(e.target.value)}
                    placeholder="напр. 5 або 10-15"
                    className="w-36 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm shadow-sm outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor="status-filter" className="text-neutral-500">
                    Статус:
                  </label>
                  <select
                    id="status-filter"
                    value={statusFilter}
                    onChange={(e) =>
                      setStatusFilter(e.target.value as Status | "all")
                    }
                    className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm shadow-sm outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
                  >
                    <option value="all">Усі</option>
                    <option value="increase">Додати</option>
                    <option value="reduce">Зменшити</option>
                    <option value="ok">OK</option>
                  </select>
                </div>
                {(targetFilter.trim() !== "" || statusFilter !== "all") && (
                  <span className="text-xs text-neutral-400">
                    показано {rows.length} з {data.results.length}
                  </span>
                )}
              </div>

              <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Ключове слово</th>
                      <th className="px-4 py-2.5 text-center font-medium">
                        <button
                          type="button"
                          onClick={() => toggleSort("found")}
                          className="inline-flex items-center transition hover:text-neutral-800"
                        >
                          Знайдено{sortArrow("found")}
                        </button>
                      </th>
                      <th className="px-4 py-2.5 text-center font-medium">
                        <button
                          type="button"
                          onClick={() => toggleSort("target")}
                          className="inline-flex items-center transition hover:text-neutral-800"
                        >
                          Ціль{sortArrow("target")}
                        </button>
                      </th>
                      <th className="px-4 py-2.5 text-center font-medium">
                        <button
                          type="button"
                          onClick={() => toggleSort("status")}
                          className="inline-flex items-center transition hover:text-neutral-800"
                        >
                          Статус{sortArrow("status")}
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {rows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-4 py-6 text-center text-sm text-neutral-400"
                        >
                          Немає ключів за обраним фільтром.
                        </td>
                      </tr>
                    ) : (
                      rows.map((r) => {
                        const s = STATUS_STYLES[r.status];
                        return (
                          <tr key={r.idx}>
                            <td className="px-4 py-2.5 font-medium">
                              <div className="flex items-center gap-2">
                                <span>{r.keyword}</span>
                                <button
                                  type="button"
                                  onClick={() => copyKeyword(r.keyword, r.idx)}
                                  title="Копіювати ключове слово"
                                  aria-label="Копіювати ключове слово"
                                  className="shrink-0 rounded p-1 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
                                >
                                  {copiedKw === r.idx ? (
                                    <span className="text-xs font-medium text-emerald-600">
                                      ✓
                                    </span>
                                  ) : (
                                    <CopyIcon />
                                  )}
                                </button>
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-center tabular-nums">
                              {r.found}
                            </td>
                            <td className="px-4 py-2.5 text-center tabular-nums text-neutral-500">
                              {r.target}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <span
                                className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${s.cls}`}
                              >
                                {s.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
