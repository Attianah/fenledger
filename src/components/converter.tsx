import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftRight, RefreshCw, Search, Star } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getHistory, getMarket, type Currency, type Market } from "@/lib/fx";

const POPULAR = ["usd", "eur", "gbp", "jpy", "chf", "cad", "aud", "cny", "inr", "mxn", "brl", "zar", "krw", "sgd"];
const QUICK = [1, 10, 100, 1000, 10000];

function loadPair() {
  const fallback = { amount: "1000", from: "usd", to: "eur", stars: ["eur", "gbp", "jpy"] };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem("fenledger-pair");
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as { amount?: string; from?: string; to?: string; stars?: string[] };
    return {
      amount: parsed.amount || fallback.amount,
      from: parsed.from || fallback.from,
      to: parsed.to || fallback.to,
      stars: Array.isArray(parsed.stars) ? parsed.stars : fallback.stars,
    };
  } catch {
    return fallback;
  }
}

function formatMoney(value: number, code: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code.toUpperCase(),
      maximumFractionDigits: value >= 100 ? 2 : 4,
    }).format(value);
  } catch {
    return `${value.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${code.toUpperCase()}`;
  }
}

function Picker({
  label,
  value,
  currencies,
  onChange,
}: {
  label: string;
  value: string;
  currencies: Currency[];
  onChange: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const current = currencies.find((c) => c.code === value);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return currencies.slice(0, 80);
    return currencies
      .filter((c) => c.code.includes(needle) || c.name.toLowerCase().includes(needle))
      .slice(0, 80);
  }, [currencies, q]);

  return (
    <div className="relative min-w-0 flex-1">
      <span className="mb-1.5 block text-xs font-medium tracking-wide text-muted uppercase">{label}</span>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-12 w-full items-center justify-between gap-3 rounded-xl border border-border bg-surface-2 px-3 text-left transition hover:border-primary/50"
      >
        <span className="min-w-0">
          <span className="font-display text-lg tracking-wide text-fg">{value.toUpperCase()}</span>
          <span className="ml-2 truncate text-sm text-muted">{current?.name ?? "Currency"}</span>
        </span>
      </button>
      {open && (
        <div className="absolute z-30 mt-2 w-full min-w-64 overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="size-4 text-muted" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name or code"
              className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted"
            />
          </div>
          <ul className="max-h-64 overflow-auto py-1">
            {filtered.map((c) => (
              <li key={c.code}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(c.code);
                    setOpen(false);
                    setQ("");
                  }}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2"
                >
                  <span className="w-12 font-medium text-primary">{c.code.toUpperCase()}</span>
                  <span className="truncate text-sm text-fg">{c.name}</span>
                </button>
              </li>
            ))}
            {filtered.length === 0 && <li className="px-3 py-4 text-sm text-muted">No match</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

export function Converter() {
  const [amount, setAmount] = useState("1000");
  const [from, setFrom] = useState("usd");
  const [to, setTo] = useState("eur");
  const [stars, setStars] = useState<string[]>(["eur", "gbp", "jpy"]);
  const [hydrated, setHydrated] = useState(false);
  const [tableQuery, setTableQuery] = useState("");

  const marketQ = useQuery({
    queryKey: ["market"],
    queryFn: () => getMarket(),
    staleTime: 1000 * 60 * 10,
  });

  const historyQ = useQuery({
    queryKey: ["history", from, to],
    queryFn: () => getHistory({ data: { from, to } }),
    enabled: Boolean(from && to && from !== to),
    staleTime: 1000 * 60 * 30,
  });

  useEffect(() => {
    const saved = loadPair();
    setAmount(saved.amount);
    setFrom(saved.from);
    setTo(saved.to);
    setStars(saved.stars);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem("fenledger-pair", JSON.stringify({ amount, from, to, stars }));
  }, [amount, from, to, stars, hydrated]);

  const market = marketQ.data;
  const numeric = Number(amount.replace(/,/g, ""));
  const rate = cross(market, from, to);
  const converted = Number.isFinite(numeric) && rate ? numeric * rate : null;
  const inverse = rate ? 1 / rate : null;
  const delta = trend(historyQ.data?.points);

  const rows = useMemo(() => {
    if (!market) return [];
    const base = market.perUsd[from];
    if (!base) return [];
    const needle = tableQuery.trim().toLowerCase();
    return market.currencies
      .filter((c) => c.code !== from)
      .map((c) => ({
        ...c,
        rate: market.perUsd[c.code] / base,
        starred: stars.includes(c.code),
      }))
      .filter((c) => !needle || c.code.includes(needle) || c.name.toLowerCase().includes(needle))
      .sort((a, b) => Number(b.starred) - Number(a.starred) || a.code.localeCompare(b.code));
  }, [market, from, tableQuery, stars]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.22em] text-primary uppercase">Live desk</p>
          <h1 className="font-display text-4xl text-fg sm:text-5xl">Fenledger</h1>
          <p className="mt-2 max-w-xl text-muted">
            Convert any publicly listed currency. Rates refresh from a free open feed and stay cached so the desk stays quick.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted">
          <span className="inline-flex size-2 rounded-full bg-up" />
          {market ? `Book date ${market.date}` : marketQ.isError ? "Feed offline" : "Loading book"}
        </div>
      </header>

      <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-2xl border border-border bg-surface p-5 sm:p-7">
          <label className="mb-1.5 block text-xs font-medium tracking-wide text-muted uppercase">Amount</label>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            className="mb-5 h-16 w-full rounded-xl border border-border bg-bg px-4 font-display text-4xl text-fg outline-none focus:border-primary"
            aria-label="Amount"
          />
          <div className="mb-4 flex flex-wrap gap-2">
            {QUICK.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setAmount(String(n))}
                className="h-9 rounded-full border border-border px-3 text-sm text-muted hover:border-primary hover:text-fg"
              >
                {n.toLocaleString()}
              </button>
            ))}
          </div>
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-end">
            <Picker label="From" value={from} currencies={market?.currencies ?? []} onChange={setFrom} />
            <button
              type="button"
              aria-label="Swap currencies"
              onClick={() => {
                setFrom(to);
                setTo(from);
              }}
              className="mx-auto flex size-12 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 text-primary hover:border-primary"
            >
              <ArrowLeftRight className="size-5" />
            </button>
            <Picker label="To" value={to} currencies={market?.currencies ?? []} onChange={setTo} />
          </div>

          <div className="mt-8 border-t border-border pt-6">
            <p className="text-xs font-medium tracking-wide text-muted uppercase">You receive</p>
            <p className="font-display text-4xl text-fg sm:text-5xl">
              {converted === null ? "—" : formatMoney(converted, to)}
            </p>
            <p className="mt-2 text-sm text-muted">
              {rate
                ? `1 ${from.toUpperCase()} = ${rate.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${to.toUpperCase()} · 1 ${to.toUpperCase()} = ${inverse?.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${from.toUpperCase()}`
                : marketQ.isError
                  ? "Could not reach the rate feed. Try refresh."
                  : "Waiting for rates"}
            </p>
            {delta && (
              <p className={`mt-1 text-sm ${delta.up ? "text-up" : "text-down"}`}>
                {delta.up ? "Up" : "Down"} {Math.abs(delta.pct).toFixed(2)}% over the sampled month
              </p>
            )}
            <button
              type="button"
              onClick={() => marketQ.refetch()}
              className="mt-4 inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-ink"
            >
              <RefreshCw className={`size-4 ${marketQ.isFetching ? "animate-spin" : ""}`} />
              Refresh book
            </button>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {POPULAR.filter((c) => market?.perUsd[c]).map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setTo(code)}
                className={`h-9 rounded-full px-3 text-sm ${to === code ? "bg-primary text-primary-ink" : "border border-border text-muted hover:text-fg"}`}
              >
                {code.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5 sm:p-7">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="font-display text-2xl">Month path</h2>
            <span className="text-sm text-muted">
              {from.toUpperCase()} → {to.toUpperCase()}
            </span>
          </div>
          <div className="h-64">
            {historyQ.data && historyQ.data.points.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={historyQ.data.points}>
                  <CartesianGrid stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: "var(--color-muted)", fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis
                    domain={["auto", "auto"]}
                    width={64}
                    tick={{ fill: "var(--color-muted)", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", borderRadius: 12 }}
                    labelStyle={{ color: "var(--color-muted)" }}
                  />
                  <Line type="monotone" dataKey="rate" stroke="var(--color-primary)" strokeWidth={2.4} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted">
                {from === to ? "Pick two different currencies" : historyQ.isError ? "History unavailable" : "Drawing the path"}
              </div>
            )}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            Samples are daily mid-market quotes from the open currency-api project (ECB and other public sources). This is not a trading quote and can lag a business day.
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="font-display text-2xl">All currencies vs {from.toUpperCase()}</h2>
            <p className="text-sm text-muted">{market ? `${market.currencies.length} codes` : "…"} · star a row to pin it</p>
          </div>
          <div className="flex h-11 items-center gap-2 rounded-xl border border-border bg-bg px-3">
            <Search className="size-4 text-muted" />
            <input
              value={tableQuery}
              onChange={(e) => setTableQuery(e.target.value)}
              placeholder="Filter the book"
              className="w-40 bg-transparent text-sm outline-none sm:w-56"
            />
          </div>
        </div>
        <div className="max-h-[28rem] overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-surface text-xs tracking-wide text-muted uppercase">
              <tr>
                <th className="px-5 py-3 font-medium">Code</th>
                <th className="px-3 py-3 font-medium">Name</th>
                <th className="px-5 py-3 text-right font-medium">Per 1 {from.toUpperCase()}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.code} className="border-t border-border/70 hover:bg-surface-2">
                  <td className="px-5 py-3">
                    <button
                      type="button"
                      onClick={() => setTo(row.code)}
                      className="font-medium text-primary"
                    >
                      {row.code.toUpperCase()}
                    </button>
                  </td>
                  <td className="px-3 py-3 text-fg">{row.name}</td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    <span className="mr-3">{row.rate.toLocaleString(undefined, { maximumFractionDigits: 6 })}</span>
                    <button
                      type="button"
                      aria-label={row.starred ? "Unpin" : "Pin"}
                      onClick={() =>
                        setStars((prev) =>
                          prev.includes(row.code) ? prev.filter((c) => c !== row.code) : [...prev, row.code].slice(0, 12),
                        )
                      }
                      className="inline-flex size-9 items-center justify-center rounded-full align-middle"
                    >
                      <Star className={`size-4 ${row.starred ? "fill-primary text-primary" : "text-muted"}`} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function cross(market: Market | undefined, from: string, to: string) {
  if (!market) return null;
  const a = market.perUsd[from];
  const b = market.perUsd[to];
  if (!a || !b) return null;
  return b / a;
}

function trend(points: { rate: number }[] | undefined) {
  if (!points || points.length < 2) return null;
  const first = points[0].rate;
  const last = points[points.length - 1].rate;
  if (!first) return null;
  const pct = ((last - first) / first) * 100;
  return { pct, up: pct >= 0 };
}
