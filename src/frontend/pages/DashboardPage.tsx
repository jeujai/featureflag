import { useEffect, useState, useMemo } from "react";
import { Link, useOutletContext } from "react-router-dom";
import {
  Flag,
  ToggleRight,
  ToggleLeft,
  Hash,
  Type,
  Braces,
  CheckCircle2,
  Plus,
  Users,
  Clock,
  BarChart3,
  Loader2,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { FlagWithConfigs, Project, Environment } from "@shared/types";

interface LayoutContext {
  selectedProject: Project | null;
  selectedEnvironment: Environment | null;
  environments: Environment[];
}

export default function DashboardPage() {
  const { selectedProject, selectedEnvironment, environments } =
    useOutletContext<LayoutContext>();

  const [flags, setFlags] = useState<FlagWithConfigs[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedProject) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get<FlagWithConfigs[]>(`/projects/${selectedProject.id}/flags`)
      .then((data) => {
        if (!cancelled) setFlags(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load flags");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [selectedProject]);

  const stats = useMemo(() => {
    const total = flags.length;
    const envId = selectedEnvironment?.id;

    let active = 0;
    let inactive = 0;
    if (envId) {
      for (const f of flags) {
        const cfg = f.environments?.[envId];
        if (cfg?.enabled) active++;
        else inactive++;
      }
    }

    const byType: Record<string, number> = { boolean: 0, string: 0, number: 0, json: 0 };
    for (const f of flags) {
      byType[f.flagType] = (byType[f.flagType] || 0) + 1;
    }

    const perEnv: { name: string; key: string; enabled: number; total: number }[] = [];
    for (const env of environments) {
      let enabled = 0;
      for (const f of flags) {
        if (f.environments?.[env.id]?.enabled) enabled++;
      }
      perEnv.push({ name: env.name, key: env.key, enabled, total });
    }

    return { total, active, inactive, byType, perEnv };
  }, [flags, selectedEnvironment, environments]);

  const activeRatio = stats.total > 0 ? (stats.active / stats.total) * 100 : 0;

  if (!selectedProject) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <Flag className="mb-4 h-12 w-12 opacity-40" />
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
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Overview for {selectedProject.name}
            {selectedEnvironment && (
              <> &middot; <span className="font-medium text-foreground">{selectedEnvironment.name}</span></>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild size="sm">
            <Link to="/flags">
              <Plus className="mr-1.5 h-4 w-4" />
              Create Flag
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/segments">
              <Users className="mr-1.5 h-4 w-4" />
              Create Segment
            </Link>
          </Button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {!loading && !error && (
        <>
          {/* Stats Grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Total Flags */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Flags</CardTitle>
                <Flag className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stats.total}</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  across {environments.length} environment{environments.length !== 1 ? "s" : ""}
                </p>
              </CardContent>
            </Card>

            {/* Active / Inactive */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Active / Inactive</CardTitle>
                <ToggleRight className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-green-600 dark:text-green-400">{stats.active}</span>
                  <span className="text-muted-foreground">/</span>
                  <span className="text-3xl font-bold text-red-500 dark:text-red-400">{stats.inactive}</span>
                </div>
                {stats.total > 0 && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                      <span>{Math.round(activeRatio)}% active</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-green-500 transition-all duration-500"
                        style={{ width: `${activeRatio}%` }}
                      />
                    </div>
                  </div>
                )}
                {stats.total === 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">No flags yet</p>
                )}
              </CardContent>
            </Card>

            {/* Flag Type Distribution */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Flag Types</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <TypeRow icon={<ToggleLeft className="h-3.5 w-3.5" />} label="Boolean" count={stats.byType.boolean} color="bg-blue-500" />
                  <TypeRow icon={<Type className="h-3.5 w-3.5" />} label="String" count={stats.byType.string} color="bg-purple-500" />
                  <TypeRow icon={<Hash className="h-3.5 w-3.5" />} label="Number" count={stats.byType.number} color="bg-amber-500" />
                  <TypeRow icon={<Braces className="h-3.5 w-3.5" />} label="JSON" count={stats.byType.json} color="bg-emerald-500" />
                </div>
              </CardContent>
            </Card>

            {/* Flags per Environment */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Per Environment</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {stats.perEnv.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No environments</p>
                ) : (
                  <div className="space-y-2">
                    {stats.perEnv.map((env) => (
                      <div key={env.key} className="flex items-center justify-between text-sm">
                        <span className="truncate text-muted-foreground">{env.name}</span>
                        <Badge variant="outline" className="ml-2 tabular-nums">
                          {env.enabled}/{env.total}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity Placeholder */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base font-medium">Recent Activity</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Clock className="mb-3 h-10 w-10 opacity-30" />
                <p className="text-sm font-medium">No recent activity</p>
                <p className="mt-1 text-xs">
                  Flag changes and updates will appear here once audit logging is enabled.
                </p>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function TypeRow({
  icon,
  label,
  count,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={`flex h-5 w-5 items-center justify-center rounded ${color} text-white`}>
        {icon}
      </span>
      <span className="flex-1 text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{count}</span>
    </div>
  );
}
