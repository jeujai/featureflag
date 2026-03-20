import { useEffect, useState, useMemo, useCallback } from "react";
import { Link, useOutletContext } from "react-router-dom";
import {
  Flag,
  Search,
  Plus,
  ToggleLeft,
  Type,
  Hash,
  Braces,
} from "lucide-react";
import { toast } from "sonner";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import type { FlagWithConfigs, Project, Environment } from "@shared/types";

interface LayoutContext {
  selectedProject: Project | null;
  selectedEnvironment: Environment | null;
  environments: Environment[];
}

const FLAG_TYPE_CONFIG: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  boolean: {
    label: "Boolean",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    icon: <ToggleLeft className="h-3 w-3" />,
  },
  string: {
    label: "String",
    className: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
    icon: <Type className="h-3 w-3" />,
  },
  number: {
    label: "Number",
    className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    icon: <Hash className="h-3 w-3" />,
  },
  json: {
    label: "JSON",
    className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    icon: <Braces className="h-3 w-3" />,
  },
};

export default function FlagsPage() {
  const { selectedProject, selectedEnvironment } =
    useOutletContext<LayoutContext>();

  const [flags, setFlags] = useState<FlagWithConfigs[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [togglingFlags, setTogglingFlags] = useState<Set<string>>(new Set());

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch flags when project changes
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
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to load flags");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedProject]);

  // Filter flags by search query (name, key, or tags)
  const filteredFlags = useMemo(() => {
    if (!debouncedQuery) return flags;
    const q = debouncedQuery.toLowerCase();
    return flags.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.key.toLowerCase().includes(q) ||
        f.tags?.some((t) => t.toLowerCase().includes(q))
    );
  }, [flags, debouncedQuery]);

  // Toggle flag on/off
  const handleToggle = useCallback(
    async (flag: FlagWithConfigs, enabled: boolean) => {
      if (!selectedProject || !selectedEnvironment) return;
      const toggleKey = `${flag.key}-${selectedEnvironment.id}`;
      setTogglingFlags((prev) => new Set(prev).add(toggleKey));

      try {
        await api.patch(
          `/projects/${selectedProject.id}/flags/${flag.key}/toggle`,
          { environmentId: selectedEnvironment.id, enabled }
        );
        // Update local state
        setFlags((prev) =>
          prev.map((f) => {
            if (f.key !== flag.key) return f;
            return {
              ...f,
              environments: {
                ...f.environments,
                [selectedEnvironment.id]: {
                  ...f.environments[selectedEnvironment.id],
                  enabled,
                },
              },
            };
          })
        );
        toast.success(
          `${flag.key} ${enabled ? "enabled" : "disabled"} in ${selectedEnvironment.name}`
        );
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Failed to toggle flag"
        );
      } finally {
        setTogglingFlags((prev) => {
          const next = new Set(prev);
          next.delete(toggleKey);
          return next;
        });
      }
    },
    [selectedProject, selectedEnvironment]
  );

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Feature Flags
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage flags for {selectedProject.name}
            {selectedEnvironment && (
              <>
                {" "}
                &middot;{" "}
                <span className="font-medium text-foreground">
                  {selectedEnvironment.name}
                </span>
              </>
            )}
          </p>
        </div>
        <Button asChild size="sm">
          <Link to="/flags">
            <Plus className="mr-1.5 h-4 w-4" />
            Create Flag
          </Link>
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by name, key, or tag…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && <FlagTableSkeleton />}

      {/* Empty state */}
      {!loading && !error && flags.length === 0 && (
        <EmptyState />
      )}

      {/* No search results */}
      {!loading && !error && flags.length > 0 && filteredFlags.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Search className="mb-3 h-10 w-10 opacity-30" />
          <p className="text-sm font-medium">No flags match your search</p>
          <p className="mt-1 text-xs">Try a different search term.</p>
        </div>
      )}

      {/* Flag table */}
      {!loading && !error && filteredFlags.length > 0 && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Flag</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Toggle</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredFlags.map((flag) => {
                const envConfig = selectedEnvironment
                  ? flag.environments?.[selectedEnvironment.id]
                  : undefined;
                const isEnabled = envConfig?.enabled ?? false;
                const toggleKey = selectedEnvironment
                  ? `${flag.key}-${selectedEnvironment.id}`
                  : flag.key;
                const isToggling = togglingFlags.has(toggleKey);
                const typeConfig = FLAG_TYPE_CONFIG[flag.flagType] ?? FLAG_TYPE_CONFIG.boolean;

                return (
                  <TableRow key={flag.id}>
                    {/* Name + Key */}
                    <TableCell>
                      <div>
                        <Link
                          to={`/flags/${flag.key}`}
                          className="font-medium text-foreground hover:text-primary hover:underline"
                        >
                          {flag.name}
                        </Link>
                        <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                          {flag.key}
                        </p>
                      </div>
                    </TableCell>

                    {/* Type badge */}
                    <TableCell>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${typeConfig.className}`}
                      >
                        {typeConfig.icon}
                        {typeConfig.label}
                      </span>
                    </TableCell>

                    {/* Status badge */}
                    <TableCell>
                      {selectedEnvironment ? (
                        isEnabled ? (
                          <Badge className="bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 border-0">
                            ON
                          </Badge>
                        ) : (
                          <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-0">
                            OFF
                          </Badge>
                        )
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Select env
                        </span>
                      )}
                    </TableCell>

                    {/* Toggle switch */}
                    <TableCell>
                      {selectedEnvironment ? (
                        <Switch
                          checked={isEnabled}
                          disabled={isToggling}
                          onCheckedChange={(checked) =>
                            handleToggle(flag, checked)
                          }
                          aria-label={`Toggle ${flag.name} in ${selectedEnvironment.name}`}
                        />
                      ) : (
                        <Switch disabled aria-label="Select an environment first" />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
      <Flag className="mb-4 h-12 w-12 text-muted-foreground opacity-40" />
      <p className="text-lg font-medium text-foreground">No flags yet</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Create your first flag to get started.
      </p>
      <Button asChild size="sm" className="mt-4">
        <Link to="/flags">
          <Plus className="mr-1.5 h-4 w-4" />
          Create Flag
        </Link>
      </Button>
    </div>
  );
}

function FlagTableSkeleton() {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Flag</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Toggle</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 5 }).map((_, i) => (
            <TableRow key={i}>
              <TableCell>
                <div className="space-y-2">
                  <div className="h-4 w-36 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                </div>
              </TableCell>
              <TableCell>
                <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
              </TableCell>
              <TableCell>
                <div className="h-5 w-10 animate-pulse rounded-full bg-muted" />
              </TableCell>
              <TableCell>
                <div className="h-6 w-11 animate-pulse rounded-full bg-muted" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
