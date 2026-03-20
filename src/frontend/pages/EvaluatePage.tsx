import { useState, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import {
  Play,
  RefreshCw,
  User,
  Globe,
  Smartphone,
  UserX,
  AlertCircle,
  FlaskConical,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  Project,
  Environment,
  EvalResponse,
  EvaluationReason,
  FlagValue,
} from "@shared/types";

interface LayoutContext {
  selectedProject: Project | null;
  selectedEnvironment: Environment | null;
  environments: Environment[];
}

// ---------------------------------------------------------------------------
// Preset contexts
// ---------------------------------------------------------------------------

const PRESET_CONTEXTS: { label: string; icon: React.ReactNode; context: Record<string, unknown> }[] = [
  {
    label: "Enterprise User",
    icon: <User className="h-3.5 w-3.5" />,
    context: { key: "user-123", email: "jane@acme.com", country: "US", plan: "enterprise", platform: "web" },
  },
  {
    label: "Free User (US)",
    icon: <Globe className="h-3.5 w-3.5" />,
    context: { key: "user-456", email: "bob@gmail.com", country: "US", plan: "free", platform: "web" },
  },
  {
    label: "Mobile User (UK)",
    icon: <Smartphone className="h-3.5 w-3.5" />,
    context: { key: "user-789", email: "alice@example.co.uk", country: "UK", plan: "pro", platform: "ios" },
  },
  {
    label: "Anonymous",
    icon: <UserX className="h-3.5 w-3.5" />,
    context: { key: "anon-001" },
  },
];

const DEFAULT_CONTEXT = JSON.stringify(PRESET_CONTEXTS[0].context, null, 2);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function reasonBadge(reason: EvaluationReason) {
  const kind = reason.kind;
  const styles: Record<string, string> = {
    OFF: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    TARGET_MATCH: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    ROLLOUT: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
    DEFAULT: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    ERROR: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  };
  return (
    <Badge className={`border-0 ${styles[kind] ?? styles.DEFAULT}`}>
      {kind}
    </Badge>
  );
}

function formatValue(value: FlagValue) {
  if (typeof value === "boolean") {
    return (
      <Badge className={`border-0 ${value ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"}`}>
        {String(value)}
      </Badge>
    );
  }
  if (typeof value === "string") {
    return <span className="font-mono text-sm">"{value}"</span>;
  }
  if (typeof value === "number") {
    return <span className="font-mono text-sm">{value}</span>;
  }
  if (value === null) {
    return <span className="font-mono text-sm text-muted-foreground">null</span>;
  }
  // object / JSON
  return (
    <pre className="mt-1 max-h-32 overflow-auto rounded-md bg-muted p-2 text-xs font-mono">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EvaluatePage() {
  const { selectedProject, selectedEnvironment, environments } =
    useOutletContext<LayoutContext>();

  const [contextText, setContextText] = useState(DEFAULT_CONTEXT);
  const [evalEnvId, setEvalEnvId] = useState<string | null>(selectedEnvironment?.id ?? null);
  const [results, setResults] = useState<EvalResponse[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep evalEnvId in sync when the global environment changes and user hasn't picked one yet
  if (evalEnvId === null && selectedEnvironment) {
    setEvalEnvId(selectedEnvironment.id);
  }

  const currentEnv = environments.find((e) => e.id === evalEnvId) ?? selectedEnvironment;

  const handleEvaluate = useCallback(async () => {
    if (!currentEnv) {
      setError("Please select an environment first.");
      return;
    }

    // Validate JSON
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(contextText);
    } catch {
      setError("Invalid JSON — please fix the context and try again.");
      return;
    }

    if (!parsed.key || typeof parsed.key !== "string") {
      setError("Context must include a non-empty \"key\" field.");
      return;
    }

    setError(null);
    setLoading(true);
    setResults(null);

    try {
      const res = await fetch("/api/eval", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentEnv.sdkKey}`,
        },
        body: JSON.stringify({ context: parsed }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? `Evaluation failed (${res.status})`);
      }

      const data = await res.json();
      setResults(data.results ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Evaluation request failed.");
    } finally {
      setLoading(false);
    }
  }, [contextText, currentEnv]);

  const loadPreset = (ctx: Record<string, unknown>) => {
    setContextText(JSON.stringify(ctx, null, 2));
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!selectedProject) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <FlaskConical className="mb-4 h-12 w-12 opacity-40" />
        <p className="text-lg font-medium">No project selected</p>
        <p className="mt-1 text-sm">Select a project from the sidebar to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Evaluate</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Try it — evaluate flags with custom contexts.
          </p>
        </div>

        {/* Environment selector */}
        <div className="w-full sm:w-56">
          <Select
            value={evalEnvId ?? ""}
            onValueChange={(v) => setEvalEnvId(v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select environment" />
            </SelectTrigger>
            <SelectContent>
              {environments.map((env) => (
                <SelectItem key={env.id} value={env.id}>
                  {env.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left panel — Context editor */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Evaluation Context</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Preset buttons */}
              <div className="flex flex-wrap gap-2">
                {PRESET_CONTEXTS.map((preset) => (
                  <Button
                    key={preset.label}
                    variant="outline"
                    size="sm"
                    onClick={() => loadPreset(preset.context)}
                    className="gap-1.5"
                  >
                    {preset.icon}
                    {preset.label}
                  </Button>
                ))}
              </div>

              {/* JSON textarea */}
              <textarea
                value={contextText}
                onChange={(e) => setContextText(e.target.value)}
                rows={12}
                spellCheck={false}
                className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y"
                placeholder='{ "key": "user-123", ... }'
              />

              {/* Error message */}
              {error && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Evaluate button */}
              <Button
                onClick={handleEvaluate}
                disabled={loading || !currentEnv}
                className="w-full gap-2"
              >
                {loading ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {loading ? "Evaluating…" : "Evaluate All Flags"}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right panel — Results */}
        <div className="space-y-4">
          {/* Loading skeleton */}
          {loading && <ResultsSkeleton />}

          {/* Results */}
          {!loading && results !== null && results.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {results.length} flag{results.length !== 1 ? "s" : ""} evaluated
                {currentEnv ? ` in ${currentEnv.name}` : ""}
              </p>
              {results.map((r) => (
                <Card key={r.flagKey}>
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-mono text-sm font-medium truncate">{r.flagKey}</p>
                        <div className="mt-2">{formatValue(r.value)}</div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end sm:gap-1.5">
                        {reasonBadge(r.reason)}
                        <span className="text-xs text-muted-foreground">
                          variation {r.variationIndex}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Empty results */}
          {!loading && results !== null && results.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-muted-foreground">
              <FlaskConical className="mb-3 h-10 w-10 opacity-30" />
              <p className="text-sm font-medium">No flags to evaluate</p>
              <p className="mt-1 text-xs">Create some flags first, then come back here.</p>
            </div>
          )}

          {/* Initial state — no results yet */}
          {!loading && results === null && (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-muted-foreground">
              <Play className="mb-3 h-10 w-10 opacity-30" />
              <p className="text-sm font-medium">Ready to evaluate</p>
              <p className="mt-1 text-xs">Enter a context and click "Evaluate All Flags".</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton loader
// ---------------------------------------------------------------------------

function ResultsSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-4 w-32 animate-pulse rounded bg-muted" />
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <div className="h-4 w-40 animate-pulse rounded bg-muted" />
                <div className="h-5 w-20 animate-pulse rounded bg-muted" />
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <div className="h-5 w-24 animate-pulse rounded-full bg-muted" />
                <div className="h-3 w-16 animate-pulse rounded bg-muted" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
