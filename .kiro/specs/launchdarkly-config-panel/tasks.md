# Implementation Plan: LaunchDarkly Config Panel — Pilot

## Overview

Condensed pilot build for demo and evaluation. Single-package TypeScript app (Express backend + React frontend), SQLite storage, in-memory cache, no Redis/SSE/RBAC/audit. Runnable with a single `npm start` command. Focus: evaluation engine, flag CRUD API, polished admin dashboard with professional UI, realistic demo seed data demonstrating deploy/activate workflows, and a self-contained "Try it" evaluation playground.

## Tasks

- [x] 1. Set up project structure and shared types
  - [x] 1.1 Initialize single-package project
    - Create `package.json` with Express, React (via Vite), TypeScript, SQLite (better-sqlite3), Tailwind CSS, shadcn/ui, and test dependencies
    - Configure `tsconfig.json` with strict mode
    - Set up Vite for frontend with proxy to Express backend
    - Configure Tailwind CSS with a professional color palette and dark mode support (`class` strategy)
    - Install and configure shadcn/ui component library (Button, Card, Badge, Switch, Tabs, Toast, Select, Dialog, Input, Table, DropdownMenu, Tooltip)
    - Create directory structure: `src/server/`, `src/engine/`, `src/frontend/`, `src/shared/`
    - _Requirements: All_

  - [x] 1.2 Define shared type definitions
    - Create `src/shared/types.ts` with core interfaces: `Project`, `Environment`, `FeatureFlag`, `Variation`, `FlagEnvironmentConfig`, `TargetingRule`, `Clause`, `ClauseOperator`, `Rollout`, `RolloutBucket`, `Segment`, `SegmentRule`, `EvaluationContext`, `EvaluationResult`, `EvaluationReason`, `FlagValue`
    - Define API request/response types
    - _Requirements: 1.1, 1.7, 2.1, 3.4, 8.5_

- [x] 2. Implement Flag Evaluation Engine
  - [x] 2.1 Implement core `evaluate` function
    - Create `src/engine/evaluate.ts` with `evaluate(flag, context, segments)` function
    - Implement priority-ordered rule evaluation (lowest priority number first)
    - Return off variation when flag disabled, default variation when no rule matches
    - Return `EvaluationResult` with value, variationIndex, and reason
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 2.2 Implement rule matching and clause operators
    - Implement `matchesRule` and `matchesCondition` with operators: `eq`, `neq`, `contains`, `startsWith`, `endsWith`, `in`, `segmentMatch`
    - AND logic within clauses, negate support, segment matching (OR between segment rules)
    - _Requirements: 3.1, 3.2, 3.4, 3.5_

  - [x] 2.3 Implement percentage rollout with MurmurHash3
    - Implement `computeRolloutBucket(userKey, flagKey, salt)` using MurmurHash3
    - Return bucket in [0, 99999], resolve to variation via cumulative weights
    - _Requirements: 2.5, 3.3_

  - [ ]* 2.4 Write unit tests for evaluation engine
    - Test: off flag returns off variation, no-match returns default, priority ordering, deterministic evaluation
    - Test: percentage rollout consistency, individual user targeting, segment matching
    - _Requirements: 2.1–2.6, 3.1–3.5_

- [x] 3. Checkpoint — Evaluation engine complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement SQLite data layer and REST API
  - [x] 4.1 Set up SQLite schema and data access
    - Create `src/server/db.ts` with better-sqlite3 setup and schema initialization
    - Tables: `projects`, `environments`, `feature_flags`, `flag_environment_configs` (targeting_rules as JSON), `segments`
    - Implement repository functions for Project, Environment, Flag, and Segment CRUD
    - Auto-initialize flag in all environments on creation (enabled=false)
    - Generate SDK keys on environment creation
    - _Requirements: 1.1–1.6, 4.1–4.4_

  - [x] 4.2 Implement Admin REST API
    - Create `src/server/routes/admin.ts` with Express router
    - Project endpoints: `GET/POST /api/projects`, `GET/PUT/DELETE /api/projects/:id`
    - Environment endpoints: `GET/POST /api/projects/:id/environments`, `GET/PUT/DELETE .../:envId`
    - Flag endpoints: `GET/POST /api/projects/:id/flags`, `GET/PUT/DELETE .../:flagKey`
    - `PUT .../flags/:flagKey/targeting` — update targeting rules
    - `PATCH .../flags/:flagKey/toggle` — toggle flag on/off
    - Segment endpoints: `GET/POST /api/projects/:id/segments`, `GET/PUT/DELETE .../:segmentId`
    - Simple API key auth via `X-API-Key` header (hardcoded key for pilot)
    - _Requirements: 1.1–1.7, 3.4, 3.6, 4.1–4.5, 5.2_

  - [x] 4.3 Implement Flag Evaluation API
    - Create `src/server/routes/evaluation.ts` with Express router
    - `POST /api/eval/:flagKey` — evaluate single flag with context body
    - `POST /api/eval` — bulk evaluate all flags for environment
    - Authenticate via `Authorization: Bearer <SDK_Key>` header
    - Return variation value, variationIndex, and reason
    - _Requirements: 8.1, 8.2, 8.4, 8.5_

  - [x] 4.4 Wire up Express server entry point
    - Create `src/server/index.ts` — Express app mounting admin and evaluation routers
    - Serve Vite-built frontend as static files in production, proxy in dev
    - Single `npm start` command starts everything
    - _Requirements: All_

- [x] 5. Implement Admin Dashboard frontend
  - [x] 5.1 Set up React app with routing, layout, and theming
    - Create React + TypeScript app in `src/frontend/` using Tailwind CSS + shadcn/ui
    - Implement dark/light mode toggle with system preference detection, persisted to localStorage
    - Professional color scheme: slate/zinc neutrals, indigo primary, semantic colors for status
    - Global layout with sidebar navigation (Dashboard, Flags, Segments, Environments, Evaluate)
    - Project selector dropdown in sidebar header
    - Environment switcher with color-coded badges: green for production, yellow for staging, blue for development
    - Toast notification system (sonner or shadcn toast) for success/error feedback on all mutations
    - API client helper with hardcoded API key
    - Responsive design: collapsible sidebar on mobile, stacked layouts on small screens
    - _Requirements: 5.1, 5.6, 10.2_

  - [x] 5.2 Implement dashboard overview page
    - Dashboard home route (`/`) showing flag statistics cards:
      - Total flags count
      - Active vs inactive flag counts (with visual ratio indicator)
      - Flags per environment breakdown
      - Flag type distribution (boolean, string, number, JSON)
    - Recent activity feed (last 10 flag changes) if available, or placeholder
    - Quick-action buttons: "Create Flag", "Create Segment"
    - Clean card-based layout with subtle shadows and rounded corners
    - _Requirements: 5.1_

  - [x] 5.3 Implement flag list view
    - Searchable and filterable flag list with shadcn Table component
    - Each row shows: flag name, flag key (monospace), flag type badge (boolean/string/number/JSON with distinct colors)
    - Status badges per environment: green "ON" / red "OFF" pills
    - Visual toggle switches (shadcn Switch) for quick on/off per selected environment
    - Toast notification on successful toggle ("dark-mode enabled in production")
    - Empty state with illustration/icon and "No flags yet — create your first flag" message with CTA button
    - Search by name, key, or tag with debounced input
    - Smooth loading skeleton states while data fetches
    - _Requirements: 5.1, 5.2, 5.4_

  - [x] 5.4 Implement flag detail page
    - Clean card-based layout with sections:
      - Header card: flag name, key, type badge, description, created date, client-side availability badge
      - Variations card: list of variations with name, value, and color-coded index indicators
      - Targeting rules card: ordered list of rules with clause descriptions, rollout visualization (progress bar for percentage rollouts), drag handle icons for reorder indication
      - Per-environment config card: tabbed or accordion view showing enabled state, default variation, off variation per environment
    - Toggle flag on/off from detail page with immediate UI feedback and toast
    - Edit targeting rules inline with add/remove rule support
    - Smooth transitions between sections (CSS transitions or framer-motion)
    - Breadcrumb navigation: Flags > flag-key
    - _Requirements: 5.2, 5.3, 5.5_

  - [x] 5.5 Implement segment and environment views
    - Segments list: card grid or table with segment name, key, rule count badge, description
    - Segment detail: condition builder showing rules with clause descriptions (attribute, operator, values)
    - Empty state for segments with helpful message
    - Environments list: card layout with environment name, color-coded badge, SDK key display with copy-to-clipboard button (masked by default, click to reveal)
    - Client SDK key display with same copy/reveal pattern
    - Toast on copy ("SDK key copied to clipboard")
    - _Requirements: 3.4, 4.1_

- [x] 6. Checkpoint — Full pilot app functional
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Demo seed data, evaluation playground, and walkthrough
  - [x] 7.1 Create seed script with realistic feature flags
    - Create `src/seed.ts` that populates SQLite with:
    - **Project:** "Acme App" with environments: development, staging, production
    - **Segments:**
      - `beta-users` — plan=enterprise OR email endsWith @acme.com
      - `us-users` — country=US
      - `mobile-users` — platform in [ios, android]
    - **Flags:**
      - `dark-mode` — boolean, toggled ON in development, OFF in staging and production (simple on/off demo)
      - `new-checkout-flow` — boolean, 50/50 percentage rollout in production, fully ON for beta-users segment in staging (progressive rollout demo)
      - `homepage-hero-banner` — multivariate string with 3 variations: "default", "summer-sale", "back-to-school"; targeting rule: us-users segment → "summer-sale", country=UK → "back-to-school", default → "default" (geo-targeted content demo)
      - `max-search-results` — multivariate number with variations: 10, 25, 50; targeting rules: plan=enterprise → 50, plan=pro → 25, default → 10 (plan-based feature gating demo)
      - `pricing-page-layout` — multivariate JSON with 2 layout config variations (layout-a and layout-b); 50/50 percentage rollout in production (A/B test demo)
      - `maintenance-mode` — boolean kill switch, OFF in all environments (emergency kill switch pattern demo)
    - Add `npm run seed` script
    - _Requirements: 1.1, 1.7, 3.1, 3.2, 3.3, 3.4, 4.1, 4.2_

  - [x] 7.2 Implement "Try it" evaluation playground page
    - Add a new route `/evaluate` in the admin dashboard accessible from sidebar navigation
    - Left panel: JSON editor (textarea with monospace font or a simple code editor) for inputting an EvaluationContext, pre-populated with a sample context: `{ "key": "user-123", "email": "jane@acme.com", "country": "US", "plan": "enterprise", "platform": "web" }`
    - Preset context buttons: "Enterprise User", "Free User (US)", "Mobile User (UK)", "Anonymous" — clicking loads a pre-built context into the editor
    - "Evaluate All Flags" button that calls `POST /api/eval` with the current environment's SDK key and the entered context
    - Right panel: results displayed as a card list, one card per flag showing:
      - Flag name and key
      - Resolved variation value (with type-appropriate formatting: boolean as colored badge, string in quotes, number plain, JSON as formatted block)
      - Variation index
      - Evaluation reason (styled badge: "OFF" in red, "TARGET_MATCH" in blue, "ROLLOUT" in purple, "DEFAULT" in gray)
    - Environment selector at the top to evaluate against different environments
    - Loading state with skeleton cards while evaluation runs
    - Error handling with clear error messages for invalid JSON context
    - _Requirements: 8.1, 8.2, 8.5, 2.1–2.5_

  - [x] 7.3 Create demo walkthrough README
    - Create `README.md` with:
      - Quick start: `npm install && npm run seed && npm start`
      - How to open the admin dashboard and explore the dashboard overview
      - Tour of the 6 sample flags and what each demonstrates (deploy/activate, progressive rollout, geo-targeting, plan-based gating, A/B testing, kill switch)
      - How to use the "Try it" evaluation playground with different user contexts
      - How to toggle a flag and re-evaluate to see the change
      - curl examples for the evaluation API with different user contexts
    - _Requirements: All (end-to-end demonstration)_

- [x] 8. Final checkpoint — Pilot complete
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- This is a pilot build for demo and evaluation — not production-ready
- SQLite for zero-infrastructure setup, in-memory or file-based
- No Redis, SSE, RBAC, audit logging, import/export, or multi-platform SDK support
- Auth is a hardcoded API key for admin routes, SDK keys for evaluation routes
- Tasks marked with `*` are optional and can be skipped
- Single `npm start` command runs the full stack
- UI built with Tailwind CSS + shadcn/ui for a polished, professional look
- Dark/light mode support with system preference detection
- Toast notifications for all user-facing mutations
- "Try it" evaluation playground makes the demo self-contained and impressive
