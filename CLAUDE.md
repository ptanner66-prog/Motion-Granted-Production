# CLAUDE.md — Motion Granted Production

## Project Overview

**Motion Granted** is an AI-powered legal motion drafting SaaS platform for solo practitioners and small law firms. It uses Claude AI to generate legal motions through a 14-phase workflow pipeline with human checkpoints, citation verification, and quality gates.

- **URL**: motiongranted.com
- **Stack**: Next.js 16.1.1, React 19, TypeScript 5.9, Tailwind CSS v4, Supabase (PostgreSQL + Auth), Stripe, Inngest
- **Deployment**: Vercel (serverless, 300s max function timeout)
- **Package manager**: pnpm (primary), npm (secondary)

## Quick Reference Commands

```bash
pnpm dev              # Start dev server (localhost:3000)
pnpm build            # Production build
pnpm lint             # ESLint (next/core-web-vitals + typescript rules)
pnpm test:e2e         # Playwright E2E tests (Chromium, Firefox, WebKit)
pnpm test:e2e:ui      # Playwright in UI mode
pnpm dev:inngest      # Run Inngest dev server for background jobs
```

**There are no unit tests (Jest/Vitest).** Only Playwright E2E tests exist in `tests/e2e/`.

## Architecture

### Directory Layout

```
app/                    Next.js App Router pages & API routes
  (auth)/               Login, register, password reset
  (marketing)/          Public pages (landing, pricing, FAQ, legal)
  (dashboard)/          Client portal (orders, settings)
  (admin)/              Admin portal (order queue, analytics, automation)
  api/                  API routes (orders, workflow, chat, webhooks, etc.)
components/             React components
  ui/                   Radix UI primitives wrapped with Tailwind
  admin/                Admin-specific components
  orders/               Order & intake wizard components
  shared/               Error boundary, logo, loading spinner
config/                 App configuration (motion types, pricing, intake form)
lib/                    Core business logic
  workflow/             14-phase workflow engine (the heart of the system)
  services/             Service layer (citations, conflicts, stripe, email)
  supabase/             Database client helpers (server.ts, client.ts)
  ai/                   AI integration (extended thinking, model routing)
  inngest/              Background job definitions
  (40+ other dirs)      Utilities, logging, monitoring, etc.
hooks/                  Custom React hooks
types/                  TypeScript type definitions
emails/                 React Email templates
supabase/               SQL schema & migrations (25+ migration files)
tests/e2e/              Playwright E2E tests
docs/                   Architecture & audit documentation
scripts/                Utility scripts (seed data, SQL audits)
```

### Path Alias

`@/*` maps to the project root. Use `@/lib/...`, `@/components/...`, etc. for imports.

### Route Groups

Route groups use parentheses and don't affect URLs:
- `(auth)` — `/login`, `/register`, `/forgot-password`, `/reset-password`
- `(marketing)` — `/`, `/pricing`, `/faq`, `/about`, `/how-it-works`, `/contact`, `/terms`, `/privacy`, `/security`, `/dpa`, `/disclaimer`
- `(dashboard)` — `/dashboard`, `/orders`, `/orders/new`, `/orders/[id]`, `/settings`
- `(admin)` — `/admin`, `/admin/orders`, `/admin/clients`, `/admin/queue`, `/admin/health`, `/admin/analytics`, `/admin/automation`, `/admin/superprompt`

## Tech Stack Details

### Database: Supabase (PostgreSQL)

- **Auth**: Supabase Auth with JWT + HTTP-only cookies via `@supabase/ssr`
- **RLS**: Row-Level Security enforced — users see only their own data
- **Roles**: `client`, `clerk`, `admin` (stored in `profiles.role`)
- **Realtime**: Supabase Realtime for live order status updates
- **Storage**: Supabase Storage for document uploads
- **Server client**: `lib/supabase/server.ts` — use in Server Components and API routes
- **Browser client**: `lib/supabase/client.ts` — use in Client Components
- **Migrations**: `supabase/migrations/` — applied manually via Supabase SQL editor

### Key Database Tables

`profiles`, `orders`, `parties`, `documents`, `order_workflows`, `superprompt_templates`, `workflows`, `conversations`, `automation_logs`, `verified_citations`, `civ_verification_runs`, `clerks`

### Order Status Flow

```
submitted → paid → in_review → assigned → in_progress → ready_for_review → completed
                                                    ↘ revision_requested → in_progress
```

### AI Integration

- **Anthropic Claude** (`@anthropic-ai/sdk`) — Motion drafting via 14-phase workflow
  - Sonnet 4 for Tier A (procedural) phases
  - Opus 4.5 for Tier B/C (complex) phases
  - Extended thinking for phases VI, VII, VIII, X
- **OpenAI** (`openai`) — Citation verification supplementary
- **Model routing**: `lib/workflow/phase-config.ts` and `lib/workflow/model-router.ts`

### Payments: Stripe

- Server: `stripe` SDK
- Client: `@stripe/stripe-js`
- Webhooks: `/api/webhooks/stripe` — triggers order automation after payment
- Motion pricing defined in `config/motion-types.ts` (Tier A: $300-400, Tier B: $700-1000, Tier C: $1500-3200)
- Rush multipliers: standard (1x), 72hr (+25%), 48hr (+50%)

### Background Jobs: Inngest

- Event-driven workflow orchestration with step-based checkpointing
- Job definitions: `lib/inngest/functions.ts`
- Inngest route: `/api/inngest`
- Long-running functions configured in `vercel.json` (up to 300s)

### Email: Resend + React Email

- Templates in `emails/` directory (order confirmation, draft ready, revision request, etc.)
- API: `resend` SDK

### Caching: Upstash Redis

- Distributed rate limiting and citation caching
- Falls back to in-memory store when Redis unavailable

## Workflow Engine (v7.2)

The 14-phase pipeline is defined in `lib/workflow/phase-config.ts`. Key files:

| File | Purpose |
|---|---|
| `lib/workflow/phase-config.ts` | Phase definitions, model routing, checkpoints (SOURCE OF TRUTH) |
| `lib/workflow/workflow-engine.ts` | Main orchestrator (~82KB) |
| `lib/workflow/phase-executors.ts` | Phase execution logic (~150KB) |
| `lib/workflow/superprompt.ts` | AI prompt generation |
| `lib/workflow/citation-verifier.ts` | Legal citation validation |
| `lib/workflow/quality-validator.ts` | QA checks |
| `lib/workflow/pdf-generator.ts` | PDF output generation |
| `lib/workflow/checkpoint-service.ts` | Admin checkpoint management |

### Phases

1. **I** — Intake & Document Processing
2. **II** — Legal Standards / Motion Deconstruction
3. **III** — Evidence Strategy / Issue Identification (HOLD checkpoint)
4. **IV** — Authority Research (NOTIFICATION checkpoint)
5. **V** — Drafting
6. **V.1** — Citation Accuracy Check
7. **VI** — Opposition Anticipation (extended thinking)
8. **VII** — Judge Simulation (Opus + extended thinking)
9. **VII.1** — Post-Revision Citation Check
10. **VIII** — Revisions (extended thinking)
11. **VIII.5** — Caption Validation
12. **IX** — Supporting Documents
13. **IX.1** — Separate Statement Check (MSJ/MSA only)
14. **X** — Final Assembly (BLOCKING checkpoint, extended thinking)

### Checkpoints

- **HOLD** (Phase III): Blocks on critical evidence gaps
- **NOTIFICATION** (Phase IV): Non-blocking alert on research completion
- **BLOCKING** (Phase X): Requires admin APPROVE / REQUEST_CHANGES / CANCEL

## Coding Conventions

### TypeScript

- **Strict mode** enabled (`tsconfig.json`)
- Target: ES2022, module resolution: bundler
- Use `@/` path alias for all imports
- Zod v4 for runtime validation (forms, API input)
- React Hook Form v7 for form state

### Styling

- **Tailwind CSS v4** with `@tailwindcss/postcss` plugin
- Color palette: Navy `#1e3a5f` (primary), Gold `#c5a059` (accent), Cream `#fdfcfb` (background)
- Fonts: EB Garamond (serif headings), Inter (sans body)
- Utility merging: `clsx` + `tailwind-merge`
- Component variants: `class-variance-authority`
- Components use Radix UI primitives in `components/ui/`

### Components

- UI primitives in `components/ui/` (Radix-based)
- Domain components organized by feature: `admin/`, `orders/`, `documents/`, `citations/`, etc.
- Shared components: `components/shared/` (error-boundary, loading-spinner, logo)

### API Routes

- Next.js App Router API routes in `app/api/`
- Auth validated via Supabase session in each route
- Admin routes check `profiles.role === 'admin'`
- Rate limiting applied in middleware (100 req/min API, 5 req/min generation, 10 req/min auth)
- API responses are never cached (`Cache-Control: no-store`)

### Error Handling

- `lib/circuit-breaker.ts` — Fault tolerance for external API calls
- `lib/utils/retry.ts` — Exponential backoff retry logic
- `lib/logger.ts` — Structured logging with request correlation

## Security

### Middleware (`middleware.ts`)

- Rate limiting (in-memory, Redis-backed in production)
- Security headers: HSTS, CSP, X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy
- Protected route enforcement (dashboard requires auth, admin requires admin role)
- Request ID tracking on all responses

### Data Protection

- Row-Level Security (RLS) on all Supabase tables
- API key encryption at rest (`ENCRYPTION_SECRET`)
- Stripe webhook signature verification
- No secrets in client-side code (`NEXT_PUBLIC_` prefix only for public values)

## Environment Variables

Required variables (see `.env.example` for full list):

```
NEXT_PUBLIC_SUPABASE_URL        # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY   # Supabase anon key (public)
SUPABASE_SERVICE_ROLE_KEY       # Supabase service role (server only)
ENCRYPTION_SECRET               # API key encryption (openssl rand -base64 32)
STRIPE_SECRET_KEY               # Stripe server key
STRIPE_WEBHOOK_SECRET           # Stripe webhook signing secret
RESEND_API_KEY                  # Transactional email
ANTHROPIC_API_KEY               # Claude AI
INNGEST_EVENT_KEY               # Background jobs
INNGEST_SIGNING_KEY             # Inngest auth
```

Optional but recommended: `COURTLISTENER_API_KEY`, `OPENAI_API_KEY`, `PACER_USERNAME`/`PACER_PASSWORD`, `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`

## Deployment

- **Platform**: Vercel
- **Config**: `vercel.json` sets long function timeouts (up to 300s for workflow/chat/inngest)
- **Build**: `next build` with strict TypeScript
- **Database migrations**: Applied manually via Supabase SQL editor (not automated in CI)
- **Stripe webhooks**: Must be configured in Stripe dashboard pointing to `/api/webhooks/stripe`

## Testing

- **Framework**: Playwright v1.58
- **Config**: `playwright.config.ts`
- **Tests**: `tests/e2e/` (auth, admin dashboard, API health, order creation)
- **Browsers**: Chromium, Firefox, WebKit + mobile (Pixel 5, iPhone 12)
- **Parallel**: Enabled (`fullyParallel: true`)
- **Retries**: 2 on CI only
- **Timeouts**: 60s test, 15s action, 30s navigation
- **Auth setup**: `tests/e2e/global.setup.ts` handles auth before test runs

## Key Patterns for AI Assistants

1. **Always check `phase-config.ts` first** when working on workflow changes — it's the source of truth
2. **The workflow engine files are large** (`workflow-engine.ts` ~82KB, `phase-executors.ts` ~150KB) — read targeted sections
3. **Supabase RLS policies** must be considered when adding new tables or queries
4. **Motion pricing is in `config/motion-types.ts`** — tiers A/B/C with rush multipliers
5. **No unit test framework exists** — only E2E tests via Playwright
6. **Louisiana-focused jurisdiction** — default jurisdictions are LA state and federal courts
7. **Citation verification (CIV)** is a core differentiator — uses CourtListener, PACER, and eyecite
8. **Admin checkpoints** require human approval at phases III and X — don't bypass these
9. **The `lib/` directory has 40+ subdirectories** — use search rather than browsing
10. **React Email templates** in `emails/` must be tested with the Resend preview tool
