# Panetto Dashboard

## Slash Commands

- `/test-all` - Run the full integration test suite (`bash scripts/run-tests.sh`). Use when asked to "全体テストしてください" or similar.

## Project

- Next.js 16 + Supabase + Tailwind + shadcn/ui
- External integrations: PANET API (user sync), タス軽くん (task webhook)
- DB: Supabase PostgreSQL with RLS

## Dev Server

```
npm run dev
```

## Test

```
bash scripts/run-tests.sh
```
