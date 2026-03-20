# LaunchDarkly Config Panel — Pilot

A standalone feature flag management platform built with Express, React (Vite), TypeScript, Tailwind CSS, shadcn/ui, and SQLite. No external services required — everything runs locally with a single command.

## Quick Start

```bash
npm install
npm run seed
npm start
```

Open [http://localhost:3001](http://localhost:3001) to access the admin dashboard.

## Admin Dashboard

The dashboard is the main interface for managing flags, environments, and segments.

### Dashboard Overview

The home page shows at-a-glance stats: total flags, active vs. inactive counts, flag type distribution, and per-environment breakdowns. Use the sidebar to navigate between sections.

### Environments

Navigate to **Environments** to see the three pre-configured environments:

| Environment | Color | Purpose |
|---|---|---|
| Development | 🟢 Green | Local dev — flags can be freely toggled |
| Staging | 🟡 Yellow | Pre-production testing with segment targeting |
| Production | 🔴 Red | Live traffic — percentage rollouts and targeting |

Each environment has its own SDK key (used for the evaluation API). Click the copy button next to an SDK key to grab it — you'll need it for curl examples below.

### Segments

Three reusable user segments are pre-configured:

- **beta-users** — Enterprise plan customers or `@acme.com` email addresses
- **us-users** — Users with `country: "US"`
- **mobile-users** — Users on `ios` or `android` platforms

## Sample Flags Tour

The seed script creates 6 flags that demonstrate common feature flag patterns:

### 1. `dark-mode` — Deploy & Activate

A simple boolean toggle. ON in development, OFF in staging and production. Demonstrates the most basic pattern: deploy code behind a flag, then activate it per environment.

### 2. `new-checkout-flow` — Progressive Rollout

Boolean flag with a staged rollout strategy:
- **Staging:** ON for the `beta-users` segment only
- **Production:** 50/50 percentage rollout to all users

Shows how to safely roll out a feature — first to internal testers, then gradually to production traffic.

### 3. `homepage-hero-banner` — Geo-Targeting

Multivariate string flag with 3 variations: `"default"`, `"summer-sale"`, `"back-to-school"`. Targeting rules in production:
- `us-users` segment → `"summer-sale"`
- `country: "UK"` → `"back-to-school"`
- Everyone else → `"default"`

Demonstrates content personalization based on geography.

### 4. `max-search-results` — Plan-Based Gating

Multivariate number flag with variations: `10`, `25`, `50`. Targeting rules in production:
- `plan: "enterprise"` → `50`
- `plan: "pro"` → `25`
- Default (free tier) → `10`

Shows how to gate feature limits by subscription plan.

### 5. `pricing-page-layout` — A/B Testing

Multivariate JSON flag with two layout configurations (`layout-a` and `layout-b`). Production has a 50/50 percentage rollout — each user deterministically sees one layout based on their user key hash.

### 6. `maintenance-mode` — Kill Switch

Boolean flag, OFF in all environments. Flip it ON to instantly enable maintenance mode across the app. Demonstrates the emergency kill switch pattern — no deploy needed.

## Evaluation Playground

Navigate to **Evaluate** in the sidebar to open the "Try it" playground.

1. **Select an environment** from the dropdown at the top (e.g., Production)
2. **Edit the user context** in the JSON editor on the left, or click a preset button:
   - **Enterprise User** — `plan: "enterprise"`, `email: "jane@acme.com"`, `country: "US"`
   - **Free User (US)** — `plan: "free"`, `country: "US"`
   - **Mobile User (UK)** — `platform: "ios"`, `country: "UK"`
   - **Anonymous** — minimal context with just a user key
3. **Click "Evaluate All Flags"** to see results on the right
4. Each result card shows the resolved value, variation index, and evaluation reason (`TARGET_MATCH`, `ROLLOUT`, `DEFAULT`, or `OFF`)

### Try This: Toggle and Re-Evaluate

1. Open the **Flags** page and find `dark-mode`
2. Toggle it ON in the Production environment
3. Go back to **Evaluate**, select Production, and click "Evaluate All Flags"
4. Notice `dark-mode` now resolves to `true` with reason `DEFAULT` instead of `OFF`


## Evaluation API (curl Examples)

The evaluation API authenticates with an SDK key. SDK keys are generated dynamically by the seed script — grab yours from the **Environments** page in the dashboard.

### Evaluate a Single Flag

```bash
# Replace <SDK_KEY> with an actual SDK key from the Environments page
curl -X POST http://localhost:3001/api/eval/dark-mode \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <SDK_KEY>" \
  -d '{"context": {"key": "user-123"}}'
```

### Bulk Evaluate All Flags

```bash
curl -X POST http://localhost:3001/api/eval \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <SDK_KEY>" \
  -d '{"context": {"key": "user-123", "email": "jane@acme.com", "country": "US", "plan": "enterprise", "platform": "web"}}'
```

### Different User Contexts

**Free user in the US:**

```bash
curl -X POST http://localhost:3001/api/eval \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <SDK_KEY>" \
  -d '{"context": {"key": "user-456", "country": "US", "plan": "free"}}'
```

**Mobile user in the UK:**

```bash
curl -X POST http://localhost:3001/api/eval \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <SDK_KEY>" \
  -d '{"context": {"key": "user-789", "country": "UK", "platform": "ios"}}'
```

**Pro plan user:**

```bash
curl -X POST http://localhost:3001/api/eval/max-search-results \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <SDK_KEY>" \
  -d '{"context": {"key": "user-321", "plan": "pro"}}'
```

### Admin API

Admin endpoints use a static API key:

```bash
# List all flags
curl http://localhost:3001/api/projects \
  -H "X-API-Key: pilot-admin-key-2024"
```

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Tailwind CSS, shadcn/ui, React Router |
| Backend | Express, TypeScript, better-sqlite3 |
| Database | SQLite (`data/flags.db`) — no external services needed |
| Build | Vite (frontend), tsx (server) |
| Testing | Vitest |

## Scripts

| Command | Description |
|---|---|
| `npm install` | Install dependencies |
| `npm run seed` | Populate the database with demo data |
| `npm start` | Start the production server on port 3001 |
| `npm run dev` | Start dev mode (server + Vite HMR) |
| `npm test` | Run tests |

## Notes

This is a pilot build for demo and evaluation purposes. It intentionally omits production concerns like Redis caching, SSE real-time updates, RBAC, audit logging, and multi-platform SDK support. Auth is a hardcoded API key for admin routes and SDK keys for evaluation routes.
