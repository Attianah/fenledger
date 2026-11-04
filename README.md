# Fenledger

Live currency desk for every currency published by the free [currency-api](https://github.com/fawazahmed0/exchange-api) feed. No API key and no paid plan.

## Stack

- TanStack Start (React 19) + Tailwind CSS v4
- Server functions cache the latest book (~20 minutes) and a short rate history (~6 hours)
- Recharts for the month path
- Rates: jsDelivr mirror, with a pages.dev fallback

## Run

```bash
npm install
npm run dev
```

The dev server listens on port 8080.

## Deploy

Any Node host that can run `npm run build` then the Vite/Nitro output works. Vercel is the intended target (`npm run build`).

Do not commit secrets. This app does not need any.
