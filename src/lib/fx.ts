import { createServerFn } from "@tanstack/react-start";

const NAMES_URL = "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies.min.json";
const RATES_URL = "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json";
const FALLBACK_LATEST = "https://latest.currency-api.pages.dev/v1/currencies/usd.min.json";
const FALLBACK_NAMES = "https://latest.currency-api.pages.dev/v1/currencies.min.json";

export type Currency = { code: string; name: string };

export type Market = {
  date: string;
  fetchedAt: string;
  currencies: Currency[];
  /** Units of each currency per 1 USD. */
  perUsd: Record<string, number>;
};

type Cache = { at: number; market: Market };
let cache: Cache | null = null;
const HISTORY_MS = 1000 * 60 * 60 * 6;
const MARKET_MS = 1000 * 60 * 20;
const historyCache = new Map<string, { at: number; points: { date: string; rate: number }[] }>();

const CODE = /^[a-z]{3}$/;

async function pullJson(primary: string, fallback: string): Promise<unknown> {
  const first = await fetch(primary, { headers: { accept: "application/json" } }).catch(() => null);
  if (first?.ok) return first.json();
  const second = await fetch(fallback, { headers: { accept: "application/json" } });
  if (!second.ok) throw new Error("Rate feed unavailable");
  return second.json();
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") throw new Error("Unexpected rate payload");
  return value as Record<string, unknown>;
}

async function fetchMarket(): Promise<Market> {
  const [namesRaw, ratesRaw] = await Promise.all([
    pullJson(NAMES_URL, FALLBACK_NAMES),
    pullJson(RATES_URL, FALLBACK_LATEST),
  ]);
  const names = asRecord(namesRaw);
  const ratesDoc = asRecord(ratesRaw);
  const date = typeof ratesDoc.date === "string" ? ratesDoc.date : new Date().toISOString().slice(0, 10);
  const usd = asRecord(ratesDoc.usd);
  const perUsd: Record<string, number> = { usd: 1 };
  for (const [code, value] of Object.entries(usd)) {
    if (!CODE.test(code)) continue;
    if (typeof value === "number" && Number.isFinite(value) && value > 0) perUsd[code] = value;
  }
  const currencies: Currency[] = Object.keys(perUsd)
    .map((code) => ({
      code,
      name: typeof names[code] === "string" ? (names[code] as string) : code.toUpperCase(),
    }))
    .sort((a, b) => a.code.localeCompare(b.code));
  return { date, fetchedAt: new Date().toISOString(), currencies, perUsd };
}

export const getMarket = createServerFn({ method: "GET" }).handler(async (): Promise<Market> => {
  if (cache && Date.now() - cache.at < MARKET_MS) return cache.market;
  const market = await fetchMarket();
  cache = { at: Date.now(), market };
  return market;
});

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export const getHistory = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const raw = (input ?? {}) as { from?: string; to?: string };
    const from = String(raw.from ?? "usd").toLowerCase();
    const to = String(raw.to ?? "eur").toLowerCase();
    if (!CODE.test(from) || !CODE.test(to)) throw new Error("Use 3-letter currency codes");
    return { from, to };
  })
  .handler(async ({ data }) => {
    const key = `${data.from}:${data.to}`;
    const hit = historyCache.get(key);
    if (hit && Date.now() - hit.at < HISTORY_MS) return { points: hit.points };

    const offsets = [28, 21, 14, 10, 7, 4, 2, 0];
    const points = (
      await Promise.all(
        offsets.map(async (offset) => {
          const date = isoDaysAgo(offset);
          const url = `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/${data.from}.min.json`;
          try {
            const res = await fetch(url, { headers: { accept: "application/json" } });
            if (!res.ok) return null;
            const json = asRecord(await res.json());
            const book = asRecord(json[data.from]);
            const rate = book[data.to];
            if (typeof rate !== "number" || !Number.isFinite(rate)) return null;
            return { date, rate };
          } catch {
            return null;
          }
        }),
      )
    ).filter((p): p is { date: string; rate: number } => p !== null);

    historyCache.set(key, { at: Date.now(), points });
    return { points };
  });
