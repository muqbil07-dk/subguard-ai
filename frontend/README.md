# Frontend foundation

SubGuard AI — **Never Lose Money on Forgotten Subscriptions.**

Reserved for React, Vite and JavaScript with Tailwind CSS, React Router,
Recharts, Lucide React and Framer Motion. This phase creates directories and
configuration contracts only; there is no frontend package manifest or runnable
application yet. Install the selected frontend dependencies in Phase 2, with a
committed lockfile. Node 24 LTS is the project baseline (see [`.nvmrc`](../.nvmrc)).

| Directory | Responsibility |
| --- | --- |
| `src/components` | Reusable accessible UI primitives; no provider credentials |
| `src/pages` | Route entry points and page composition |
| `src/layouts` | Navigation and authenticated application shell |
| `src/features` | Subscription, protection, payment and assistant workflows |
| `src/services` | REST client, Supabase Auth client; response/error normalization |
| `src/hooks` | Shared interaction, session and data-loading hooks |
| `src/utils` | Pure display helpers; currency-aware formatting, no financial decisions |
| `src/assets` | Local images, icons and fonts with known licensing |

Copy [`.env.example`](.env.example) to `.env.local` only when the frontend is
implemented. All `VITE_*` values are public. A publishable Supabase key is safe
only with correct database grants and Row Level Security. Never place a PayPal
secret, AI key or Supabase service-role key in this directory.

Use [architecture](../docs/ARCHITECTURE.md),
[API contracts](../docs/API_DOCUMENTATION.md) and the
[roadmap](../docs/DEVELOPMENT_PLAN.md) before implementing routes. UI fixtures
must be visibly labeled sample data and isolated from real user accounts.
