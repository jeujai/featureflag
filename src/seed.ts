import { v4 as uuidv4 } from "uuid";
import {
  initDb,
  getDb,
  createProject,
  createEnvironment,
  createFlag,
  createSegment,
  updateFlagConfig,
  getFlagByKey,
  getEnvironments,
} from "./server/db.js";

// ============================================================
// Seed script — populates SQLite with realistic demo data
// ============================================================

function main() {
  console.log("🌱 Seeding database...\n");

  // Initialize and wipe existing data
  const db = initDb("data/flags.db");
  db.exec(`
    DELETE FROM flag_environment_configs;
    DELETE FROM feature_flags;
    DELETE FROM segments;
    DELETE FROM environments;
    DELETE FROM projects;
  `);

  // --- Project ---
  console.log("📁 Creating project: Acme App");
  const project = createProject({ name: "Acme App", key: "acme-app" });

  // --- Environments ---
  console.log("🌍 Creating environments...");
  const devEnv = createEnvironment(project.id, {
    name: "Development",
    key: "development",
    color: "#22c55e", // green
  });
  const stagingEnv = createEnvironment(project.id, {
    name: "Staging",
    key: "staging",
    color: "#eab308", // yellow
  });
  const prodEnv = createEnvironment(project.id, {
    name: "Production",
    key: "production",
    color: "#ef4444", // red
  });
  console.log(`  ✅ development (${devEnv.sdkKey})`);
  console.log(`  ✅ staging     (${stagingEnv.sdkKey})`);
  console.log(`  ✅ production  (${prodEnv.sdkKey})`);

  // --- Segments ---
  console.log("\n👥 Creating segments...");

  const betaUsers = createSegment(project.id, {
    key: "beta-users",
    name: "Beta Users",
    description: "Enterprise customers or Acme employees",
    rules: [
      { clauses: [{ attribute: "plan", operator: "eq", values: ["enterprise"], negate: false }] },
      { clauses: [{ attribute: "email", operator: "endsWith", values: ["@acme.com"], negate: false }] },
    ],
  });
  console.log("  ✅ beta-users");

  const usUsers = createSegment(project.id, {
    key: "us-users",
    name: "US Users",
    description: "Users located in the United States",
    rules: [
      { clauses: [{ attribute: "country", operator: "eq", values: ["US"], negate: false }] },
    ],
  });
  console.log("  ✅ us-users");

  const mobileUsers = createSegment(project.id, {
    key: "mobile-users",
    name: "Mobile Users",
    description: "Users on iOS or Android platforms",
    rules: [
      { clauses: [{ attribute: "platform", operator: "in", values: ["ios", "android"], negate: false }] },
    ],
  });
  console.log("  ✅ mobile-users");

  // --- Flags ---
  console.log("\n🚩 Creating feature flags...");

  // 1. dark-mode — simple boolean toggle
  const darkMode = createFlag(project.id, {
    key: "dark-mode",
    name: "Dark Mode",
    description: "Enable dark mode UI theme across the application",
    flagType: "boolean",
    variations: [
      { value: true, name: "On" },
      { value: false, name: "Off" },
    ],
    tags: ["ui", "theme"],
  });
  // ON in development, OFF in staging & production
  updateFlagConfig(darkMode.id, devEnv.id, {
    enabled: true,
    defaultVariationIndex: 0,
    offVariationIndex: 1,
  });
  updateFlagConfig(darkMode.id, stagingEnv.id, {
    enabled: false,
    defaultVariationIndex: 0,
    offVariationIndex: 1,
  });
  updateFlagConfig(darkMode.id, prodEnv.id, {
    enabled: false,
    defaultVariationIndex: 0,
    offVariationIndex: 1,
  });
  console.log("  ✅ dark-mode (boolean — ON in dev, OFF elsewhere)");

  // 2. new-checkout-flow — progressive rollout demo
  const newCheckout = createFlag(project.id, {
    key: "new-checkout-flow",
    name: "New Checkout Flow",
    description: "Redesigned checkout experience with streamlined steps",
    flagType: "boolean",
    variations: [
      { value: true, name: "On" },
      { value: false, name: "Off" },
    ],
    tags: ["checkout", "experiment"],
  });
  // Staging: fully ON for beta-users segment
  updateFlagConfig(newCheckout.id, stagingEnv.id, {
    enabled: true,
    defaultVariationIndex: 0,
    offVariationIndex: 1,
    targetingRules: [
      {
        id: uuidv4(),
        priority: 0,
        description: "Beta users get new checkout",
        clauses: [
          { attribute: "segmentMatch", operator: "segmentMatch", values: ["beta-users"], negate: false },
        ],
        rollout: { kind: "single", variationIndex: 0 },
      },
    ],
  });
  // Production: 50/50 percentage rollout
  updateFlagConfig(newCheckout.id, prodEnv.id, {
    enabled: true,
    defaultVariationIndex: 0,
    offVariationIndex: 1,
    targetingRules: [
      {
        id: uuidv4(),
        priority: 0,
        description: "50/50 rollout to all users",
        clauses: [],
        rollout: {
          kind: "percentage",
          buckets: [
            { variationIndex: 0, weight: 50000 },
            { variationIndex: 1, weight: 50000 },
          ],
        },
      },
    ],
  });
  console.log("  ✅ new-checkout-flow (boolean — beta segment in staging, 50/50 in prod)");

  // 3. homepage-hero-banner — multivariate string, geo-targeted
  const heroBanner = createFlag(project.id, {
    key: "homepage-hero-banner",
    name: "Homepage Hero Banner",
    description: "Geo-targeted hero banner content for the homepage",
    flagType: "string",
    variations: [
      { value: "default", name: "Default" },
      { value: "summer-sale", name: "Summer Sale" },
      { value: "back-to-school", name: "Back to School" },
    ],
    tags: ["marketing", "homepage"],
    clientSideAvailable: true,
  });
  // Production: us-users → summer-sale, country=UK → back-to-school, default → "default"
  updateFlagConfig(heroBanner.id, prodEnv.id, {
    enabled: true,
    defaultVariationIndex: 0, // "default"
    offVariationIndex: 0,
    targetingRules: [
      {
        id: uuidv4(),
        priority: 0,
        description: "US users see summer sale banner",
        clauses: [
          { attribute: "segmentMatch", operator: "segmentMatch", values: ["us-users"], negate: false },
        ],
        rollout: { kind: "single", variationIndex: 1 }, // summer-sale
      },
      {
        id: uuidv4(),
        priority: 1,
        description: "UK users see back-to-school banner",
        clauses: [
          { attribute: "country", operator: "eq", values: ["UK"], negate: false },
        ],
        rollout: { kind: "single", variationIndex: 2 }, // back-to-school
      },
    ],
  });
  console.log("  ✅ homepage-hero-banner (string — geo-targeted content)");

  // 4. max-search-results — multivariate number, plan-based gating
  const maxSearch = createFlag(project.id, {
    key: "max-search-results",
    name: "Max Search Results",
    description: "Maximum number of search results returned based on user plan",
    flagType: "number",
    variations: [
      { value: 10, name: "Free Tier" },
      { value: 25, name: "Pro Tier" },
      { value: 50, name: "Enterprise Tier" },
    ],
    tags: ["search", "plans"],
  });
  // Production: enterprise → 50, pro → 25, default → 10
  updateFlagConfig(maxSearch.id, prodEnv.id, {
    enabled: true,
    defaultVariationIndex: 0, // 10 (free)
    offVariationIndex: 0,
    targetingRules: [
      {
        id: uuidv4(),
        priority: 0,
        description: "Enterprise users get 50 results",
        clauses: [
          { attribute: "plan", operator: "eq", values: ["enterprise"], negate: false },
        ],
        rollout: { kind: "single", variationIndex: 2 }, // 50
      },
      {
        id: uuidv4(),
        priority: 1,
        description: "Pro users get 25 results",
        clauses: [
          { attribute: "plan", operator: "eq", values: ["pro"], negate: false },
        ],
        rollout: { kind: "single", variationIndex: 1 }, // 25
      },
    ],
  });
  console.log("  ✅ max-search-results (number — plan-based gating)");

  // 5. pricing-page-layout — multivariate JSON, A/B test
  const pricingLayout = createFlag(project.id, {
    key: "pricing-page-layout",
    name: "Pricing Page Layout",
    description: "A/B test for pricing page layout configuration",
    flagType: "json",
    variations: [
      {
        value: {
          layout: "layout-a",
          columns: 3,
          showAnnualToggle: true,
          highlightPlan: "pro",
        },
        name: "Layout A",
      },
      {
        value: {
          layout: "layout-b",
          columns: 2,
          showAnnualToggle: false,
          highlightPlan: "enterprise",
        },
        name: "Layout B",
      },
    ],
    tags: ["pricing", "experiment"],
    clientSideAvailable: true,
  });
  // Production: 50/50 percentage rollout
  updateFlagConfig(pricingLayout.id, prodEnv.id, {
    enabled: true,
    defaultVariationIndex: 0,
    offVariationIndex: 0,
    targetingRules: [
      {
        id: uuidv4(),
        priority: 0,
        description: "50/50 A/B test for pricing layout",
        clauses: [],
        rollout: {
          kind: "percentage",
          buckets: [
            { variationIndex: 0, weight: 50000 },
            { variationIndex: 1, weight: 50000 },
          ],
        },
      },
    ],
  });
  console.log("  ✅ pricing-page-layout (JSON — 50/50 A/B test in prod)");

  // 6. maintenance-mode — boolean kill switch, OFF everywhere
  const maintenanceMode = createFlag(project.id, {
    key: "maintenance-mode",
    name: "Maintenance Mode",
    description: "Emergency kill switch to enable maintenance mode across the app",
    flagType: "boolean",
    variations: [
      { value: true, name: "On" },
      { value: false, name: "Off" },
    ],
    tags: ["ops", "kill-switch"],
  });
  // OFF in all environments (default state from createFlag is already disabled)
  updateFlagConfig(maintenanceMode.id, devEnv.id, {
    enabled: false,
    defaultVariationIndex: 0,
    offVariationIndex: 1,
  });
  updateFlagConfig(maintenanceMode.id, stagingEnv.id, {
    enabled: false,
    defaultVariationIndex: 0,
    offVariationIndex: 1,
  });
  updateFlagConfig(maintenanceMode.id, prodEnv.id, {
    enabled: false,
    defaultVariationIndex: 0,
    offVariationIndex: 1,
  });
  console.log("  ✅ maintenance-mode (boolean — kill switch, OFF everywhere)");

  console.log("\n✨ Seed complete! Database populated with demo data.");
  console.log("   Run `npm start` to launch the app.\n");
}

main();
