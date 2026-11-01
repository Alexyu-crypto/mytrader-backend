# Project memory

## Product intent & audience

- React + Vite + Supabase web app for real-time MetaTrader (MT4/MT5) account monitoring, trade history tracking, and multi-broker copy trading management.
- Integrates with MetaApi cloud service to relay account/trade data via custom Expert Advisors.
- Target users: traders managing multiple MT accounts across brokers, needing live monitoring and copy-trade execution.

## Brand personality & voice

- Technical, direct, data-driven communication style.
- Bilingual context: user communicates in Traditional Chinese; assistant responds in same language.

## Visual design & UX direction

- `.bolt/prompt` specifies: beautiful, production-worthy, non-cookie-cutter designs; Tailwind CSS + Lucide React icons; `@/` path alias for imports. (Not restated here.)
- Inferred: dashboard-heavy UI with real-time data tables, status indicators, account cards, trade history views.

## Decisions, constraints & rationale

- **Supabase free-tier limits are a critical constraint.** Included quotas: 250 MB DB storage, 100 hrs DB compute, 100K Edge Function invocations, 100K Realtime events, 1 GB file storage, 30 GB bandwidth, 1M hosting requests.
- **Current state (as of this turn): DB reports 764 MB total** — well over 250 MB limit. App's own tables are ~10 MB; bulk is likely background job logs (unconfirmed, query timed out).
- **Edge Function invocations estimated at ~864K/month** — ~8-9x over the 100K limit. Root cause: a background job calls MetaApi relay every 3 seconds, 24/7 (~28,800 calls/day). One call handles all accounts, so invocations don't scale per-account.
- **Scaling to 300 MT accounts:** Edge Function invocations stay roughly same (not per-account), but DB storage grows with trade history (~27x current data), compute and realtime events rise significantly. Would exceed 250 MB DB storage within months.
- **No changes made yet** — user was asked to choose between: (1) slow relay from 3s to ~1min (~43K invocations/month, but copy delay up to 1 min), (2) keep 3s speed and upgrade plan, (3) fix storage/log cleanup first. Assistant recommended option 3 first, then decide on 1 vs 2.
- **Assistant cannot read live Supabase usage meter** (Bolt Settings → Cloud → Monthly usage) — estimates derived from app's own schedules and DB queries.

## Open questions & assumptions

- **Unconfirmed:** whether background job logs are the cause of 764 MB DB bloat (confirming query timed out).
- **Unresolved:** user's preferred approach for reducing Edge Function invocations (slow relay vs upgrade plan).
- **Assumption:** one Edge Function call fetches data for all MetaApi accounts in a batch (not per-account calls).
- **Unknown:** actual live usage for web hosting bandwidth/requests and realtime events (site was paused at time of analysis).
- **Unknown:** user's tolerance for copy-trade latency if relay is slowed to 1-minute intervals.