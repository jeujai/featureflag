import { useEffect, useState, useCallback } from "react";
import { useParams, useOutletContext, Link } from "react-router-dom";
import {
  Flag,
  ChevronRight,
  ToggleLeft,
  Type,
  Hash,
  Braces,
  Calendar,
  Globe,
  Loader2,
  GripVertical,
  ArrowRight,
  Percent,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import type {
  FlagWithConfigs,
  Project,
  Environment,
  TargetingRule,
  Clause,
  Rollout,
  Variation,
  FlagType,
} from "@shared/types";

interface LayoutContext {
  selectedProject: Project | null;
  selectedEnvironment: Environment | null;
  environments: Environment[];
}

const FLAG_TYPE_CONFIG: Record<
  string,
  { label: string; className: string; icon: React.ReactNode }
> = {
  boolean: {
    label: "Boolean",
    className:
      "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    icon: <ToggleLeft className="h-3 w-3" />,
  },
  string: {
    label: "String",
    className:
      "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
    icon: <Type className="h-3 w-3" />,
  },
  number: {
    label: "Number",
    className:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    icon: <Hash className="h-3 w-3" />,
  },
  json: {
    label: "JSON",
    className:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    icon: <Braces className="h-3 w-3" />,
  },
};

const VARIATION_COLORS = [
  "bg-blue-500",
  "bg-green-500",
  "bg-amber-500",
  "bg-purple-500",
  "bg-pink-500",
  "bg-cyan-500",
  "bg-red-500",
  "bg-indigo-500",
];

export default function FlagDetailPage() {
  const { flagKey } = useParams<{ flagKey: string }>();
  const { selectedProject, selectedEnvironment, environments } =
    useOutletContext<LayoutContext>();

  const [flag, setFlag] = useState<FlagWithConfigs | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    if (!selectedProject || !flagKey) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get<FlagWithConfigs>(
        `/projects/${selectedProject.id}/flags/${flagKey}`
      )
      .then((data) => {
        if (!cancelled) setFlag(data);
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to load flag");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedProject, flagKey]);

  const handleToggle = useCallback(
    async (enabled: boolean) => {
      if (!selectedProject || !selectedEnvironment || !flag) return;
      setToggling(true);
      try {
        await api.patch(
          `/projects/${selectedProject.id}/flags/${flag.key}/toggle`,
          { environmentId: selectedEnvironment.id, enabled }
        );
        setFlag((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            environments: {
              ...prev.environments,
              [selectedEnvironment.id]: {
                ...prev.environments[selectedEnvironment.id],
                enabled,
              },
            },
          };
        });
        toast.success(
          `${flag.key} ${enabled ? "enabled" : "disabled"} in ${selectedEnvironment.name}`
        );
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Failed to toggle flag"
        );
      } finally {
        setToggling(false);
      }
    },
    [selectedProject, selectedEnvironment, flag]
  );

  const envConfig = selectedEnvironment
    ? flag?.environments?.[selectedEnvironment.id]
    : undefined;
  const isEnabled = envConfig?.enabled ?? false;

  if (!selectedProject) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <Flag className="mb-4 h-12 w-12 opacity-40" />
        <p className="text-lg font-medium">No project selected</p>
        <p className="mt-1 text-sm">
          Select a project from the sidebar to get started.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Breadcrumb flagKey={flagKey} />
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Breadcrumb flagKey={flagKey} />
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex items-center gap-3 py-4 text-sm text-destructive">
            <AlertCircle className="h-5 w-5 shrink-0" />
            {error}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!flag) return null;

  const typeConfig = FLAG_TYPE_CONFIG[flag.flagType] ?? FLAG_TYPE_CONFIG.boolean;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Breadcrumb flagKey={flag.key} />

      {/* Header Card */}
      <Card className="transition-shadow duration-200 hover:shadow-md">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-semibold tracking-tight">
                  {flag.name}
                </h1>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${typeConfig.className}`}
                >
                  {typeConfig.icon}
                  {typeConfig.label}
                </span>
                {flag.clientSideAvailable && (
                  <Badge
                    variant="outline"
                    className="gap-1 border-sky-300 text-sky-700 dark:border-sky-700 dark:text-sky-300"
                  >
                    <Globe className="h-3 w-3" />
                    Client-side
                  </Badge>
                )}
              </div>
              <p className="font-mono text-sm text-muted-foreground">
                {flag.key}
              </p>
              {flag.description && (
                <p className="text-sm text-muted-foreground">
                  {flag.description}
                </p>
              )}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                Created{" "}
                {new Date(flag.createdAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </div>
            </div>

            {/* Toggle */}
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
              <div className="text-right">
                <p className="text-xs font-medium text-muted-foreground">
                  {selectedEnvironment?.name ?? "No env"}
                </p>
                <p
                  className={`text-sm font-semibold ${
                    isEnabled
                      ? "text-green-600 dark:text-green-400"
                      : "text-red-500 dark:text-red-400"
                  }`}
                >
                  {isEnabled ? "Enabled" : "Disabled"}
                </p>
              </div>
              <Switch
                checked={isEnabled}
                disabled={toggling || !selectedEnvironment}
                onCheckedChange={handleToggle}
                aria-label={`Toggle ${flag.name}`}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Variations Card */}
      <VariationsCard variations={flag.variations} flagType={flag.flagType} />

      {/* Targeting Rules Card */}
      {envConfig && (
        <TargetingRulesCard
          rules={envConfig.targetingRules}
          variations={flag.variations}
          environmentName={selectedEnvironment?.name ?? ""}
        />
      )}

      {/* Per-Environment Config Card */}
      <EnvironmentConfigCard
        flag={flag}
        environments={environments}
        selectedEnvironmentId={selectedEnvironment?.id}
      />
    </div>
  );
}


/* ------------------------------------------------------------------ */
/* Breadcrumb                                                          */
/* ------------------------------------------------------------------ */

function Breadcrumb({ flagKey }: { flagKey?: string }) {
  return (
    <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <Link
        to="/flags"
        className="transition-colors hover:text-foreground"
      >
        Flags
      </Link>
      <ChevronRight className="h-3.5 w-3.5" />
      <span className="font-medium text-foreground">{flagKey ?? "…"}</span>
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/* Variations Card                                                     */
/* ------------------------------------------------------------------ */

function VariationsCard({
  variations,
  flagType,
}: {
  variations: Variation[];
  flagType: FlagType;
}) {
  return (
    <Card className="transition-shadow duration-200 hover:shadow-md">
      <CardHeader>
        <CardTitle className="text-base font-medium">Variations</CardTitle>
      </CardHeader>
      <CardContent>
        {variations.length === 0 ? (
          <p className="text-sm text-muted-foreground">No variations defined.</p>
        ) : (
          <div className="space-y-3">
            {variations.map((v, idx) => (
              <div
                key={v.id}
                className="flex items-center gap-3 rounded-md border border-border bg-muted/20 px-4 py-3 transition-colors hover:bg-muted/40"
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
                    VARIATION_COLORS[idx % VARIATION_COLORS.length]
                  }`}
                >
                  {idx}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{v.name || `Variation ${idx}`}</p>
                  <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                    {formatVariationValue(v.value, flagType)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatVariationValue(value: unknown, flagType: FlagType): string {
  if (value === null || value === undefined) return "null";
  if (flagType === "boolean") return String(value);
  if (flagType === "number") return String(value);
  if (flagType === "json") {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/* ------------------------------------------------------------------ */
/* Targeting Rules Card                                                */
/* ------------------------------------------------------------------ */

function TargetingRulesCard({
  rules,
  variations,
  environmentName,
}: {
  rules: TargetingRule[];
  variations: Variation[];
  environmentName: string;
}) {
  const sorted = [...rules].sort((a, b) => a.priority - b.priority);

  return (
    <Card className="transition-shadow duration-200 hover:shadow-md">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium">
            Targeting Rules
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {environmentName}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No targeting rules configured. The default variation will be served.
          </p>
        ) : (
          <div className="space-y-3">
            {sorted.map((rule, idx) => (
              <div
                key={rule.id}
                className="rounded-md border border-border bg-muted/20 p-4 transition-colors hover:bg-muted/40"
              >
                <div className="flex items-start gap-3">
                  <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" />
                  <div className="min-w-0 flex-1 space-y-2">
                    {/* Rule header */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-muted-foreground">
                        Rule {idx + 1}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        (priority {rule.priority})
                      </span>
                    </div>

                    {/* Description */}
                    {rule.description && (
                      <p className="text-sm text-muted-foreground">
                        {rule.description}
                      </p>
                    )}

                    {/* Clauses */}
                    <div className="space-y-1">
                      {rule.clauses.map((clause, ci) => (
                        <div key={ci} className="flex flex-wrap items-center gap-1.5 text-sm">
                          {ci > 0 && (
                            <span className="text-xs font-semibold text-muted-foreground">
                              AND
                            </span>
                          )}
                          <ClauseDisplay clause={clause} />
                        </div>
                      ))}
                    </div>

                    {/* Rollout */}
                    <div className="flex items-center gap-2 pt-1">
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                      <RolloutDisplay
                        rollout={rule.rollout}
                        variations={variations}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ClauseDisplay({ clause }: { clause: Clause }) {
  const op = clause.operator;
  const attr = clause.attribute;
  const vals = clause.values.map((v) => String(v)).join(", ");
  const negatePrefix = clause.negate ? "NOT " : "";

  const opLabels: Record<string, string> = {
    eq: "is",
    neq: "is not",
    contains: "contains",
    startsWith: "starts with",
    endsWith: "ends with",
    in: "is one of",
    segmentMatch: "is in segment",
  };

  const opLabel = opLabels[op] ?? op;

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge variant="outline" className="font-mono text-xs">
        {attr}
      </Badge>
      <span className="text-xs text-muted-foreground">
        {negatePrefix}{opLabel}
      </span>
      <Badge variant="secondary" className="font-mono text-xs">
        {vals}
      </Badge>
    </span>
  );
}

function RolloutDisplay({
  rollout,
  variations,
}: {
  rollout: Rollout;
  variations: Variation[];
}) {
  if (rollout.kind === "single") {
    const v = variations[rollout.variationIndex];
    return (
      <span className="flex items-center gap-1.5 text-sm">
        <span
          className={`inline-block h-3 w-3 rounded-full ${
            VARIATION_COLORS[rollout.variationIndex % VARIATION_COLORS.length]
          }`}
        />
        <span className="font-medium">
          {v?.name || `Variation ${rollout.variationIndex}`}
        </span>
      </span>
    );
  }

  // Percentage rollout
  const totalWeight = rollout.buckets.reduce((s, b) => s + b.weight, 0);

  return (
    <div className="flex-1 space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Percent className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          Percentage rollout
        </span>
      </div>
      {/* Progress bar */}
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
        {rollout.buckets.map((bucket, bi) => {
          const pct = totalWeight > 0 ? (bucket.weight / totalWeight) * 100 : 0;
          return (
            <div
              key={bi}
              className={`${
                VARIATION_COLORS[bucket.variationIndex % VARIATION_COLORS.length]
              } transition-all duration-300`}
              style={{ width: `${pct}%` }}
              title={`${variations[bucket.variationIndex]?.name ?? `Var ${bucket.variationIndex}`}: ${(bucket.weight / 1000).toFixed(1)}%`}
            />
          );
        })}
      </div>
      {/* Labels */}
      <div className="flex flex-wrap gap-3">
        {rollout.buckets.map((bucket, bi) => {
          const pct = totalWeight > 0 ? (bucket.weight / totalWeight) * 100 : 0;
          const v = variations[bucket.variationIndex];
          return (
            <span key={bi} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${
                  VARIATION_COLORS[bucket.variationIndex % VARIATION_COLORS.length]
                }`}
              />
              {v?.name || `Var ${bucket.variationIndex}`}: {pct.toFixed(1)}%
            </span>
          );
        })}
      </div>
    </div>
  );
}


/* ------------------------------------------------------------------ */
/* Per-Environment Config Card                                         */
/* ------------------------------------------------------------------ */

function envColorDot(key: string): string {
  const k = key.toLowerCase();
  if (k.includes("prod")) return "bg-green-500";
  if (k.includes("stag")) return "bg-yellow-500";
  return "bg-blue-500";
}

function EnvironmentConfigCard({
  flag,
  environments,
  selectedEnvironmentId,
}: {
  flag: FlagWithConfigs;
  environments: Environment[];
  selectedEnvironmentId?: string;
}) {
  const defaultTab = selectedEnvironmentId ?? environments[0]?.id ?? "";

  if (environments.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">
            Environment Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No environments available.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="transition-shadow duration-200 hover:shadow-md">
      <CardHeader>
        <CardTitle className="text-base font-medium">
          Environment Configuration
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={defaultTab}>
          <TabsList className="mb-4 flex-wrap">
            {environments.map((env) => (
              <TabsTrigger key={env.id} value={env.id} className="gap-1.5">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${envColorDot(env.key)}`}
                />
                {env.name}
              </TabsTrigger>
            ))}
          </TabsList>

          {environments.map((env) => {
            const cfg = flag.environments?.[env.id];
            const enabled = cfg?.enabled ?? false;
            const defaultVar = flag.variations[cfg?.defaultVariationIndex ?? 0];
            const offVar = flag.variations[cfg?.offVariationIndex ?? 0];

            return (
              <TabsContent key={env.id} value={env.id}>
                <div className="grid gap-4 sm:grid-cols-3">
                  {/* Enabled state */}
                  <div className="rounded-md border border-border p-4">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Status
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <span
                        className={`inline-block h-3 w-3 rounded-full ${
                          enabled ? "bg-green-500" : "bg-red-500"
                        }`}
                      />
                      <span
                        className={`text-sm font-semibold ${
                          enabled
                            ? "text-green-600 dark:text-green-400"
                            : "text-red-500 dark:text-red-400"
                        }`}
                      >
                        {enabled ? "Enabled" : "Disabled"}
                      </span>
                    </div>
                  </div>

                  {/* Default variation */}
                  <div className="rounded-md border border-border p-4">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Default Variation
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <span
                        className={`inline-block h-3 w-3 rounded-full ${
                          VARIATION_COLORS[
                            (cfg?.defaultVariationIndex ?? 0) %
                              VARIATION_COLORS.length
                          ]
                        }`}
                      />
                      <span className="text-sm font-medium">
                        {defaultVar?.name ?? `Variation ${cfg?.defaultVariationIndex ?? 0}`}
                      </span>
                    </div>
                  </div>

                  {/* Off variation */}
                  <div className="rounded-md border border-border p-4">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Off Variation
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <span
                        className={`inline-block h-3 w-3 rounded-full ${
                          VARIATION_COLORS[
                            (cfg?.offVariationIndex ?? 0) %
                              VARIATION_COLORS.length
                          ]
                        }`}
                      />
                      <span className="text-sm font-medium">
                        {offVar?.name ?? `Variation ${cfg?.offVariationIndex ?? 0}`}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Targeting rules count */}
                {cfg && cfg.targetingRules.length > 0 && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    {cfg.targetingRules.length} targeting rule
                    {cfg.targetingRules.length !== 1 ? "s" : ""} configured
                  </p>
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      </CardContent>
    </Card>
  );
}
