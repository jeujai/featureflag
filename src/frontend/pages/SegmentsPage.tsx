import { useEffect, useState, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import {
  Users,
  ChevronDown,
  ChevronRight,
  Loader2,
  ListFilter,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import type { Project, Environment, Segment, Clause } from "@shared/types";

interface LayoutContext {
  selectedProject: Project | null;
  selectedEnvironment: Environment | null;
  environments: Environment[];
}

export default function SegmentsPage() {
  const { selectedProject } = useOutletContext<LayoutContext>();

  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedProject) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get<Segment[]>(`/projects/${selectedProject.id}/segments`)
      .then((data) => {
        if (!cancelled) setSegments(data);
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to load segments");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedProject]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  if (!selectedProject) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <Users className="mb-4 h-12 w-12 opacity-40" />
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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Segments</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage user segments for {selectedProject.name}
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && segments.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
          <Users className="mb-4 h-12 w-12 text-muted-foreground opacity-40" />
          <p className="text-lg font-medium text-foreground">
            No segments yet
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Segments let you target groups of users based on attributes like
            plan, country, or email domain.
          </p>
        </div>
      )}

      {/* Segment cards */}
      {!loading && !error && segments.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {segments.map((segment) => {
            const isExpanded = expandedId === segment.id;
            const ruleCount = segment.rules?.length ?? 0;

            return (
              <Card
                key={segment.id}
                className="transition-shadow duration-200 hover:shadow-md"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base font-medium">
                        {segment.name}
                      </CardTitle>
                      <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                        {segment.key}
                      </p>
                    </div>
                    <Badge variant="secondary" className="shrink-0 gap-1">
                      <ListFilter className="h-3 w-3" />
                      {ruleCount} rule{ruleCount !== 1 ? "s" : ""}
                    </Badge>
                  </div>
                  {segment.description && (
                    <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
                      {segment.description}
                    </p>
                  )}
                </CardHeader>

                {/* Expandable rules section */}
                {ruleCount > 0 && (
                  <CardContent className="pt-0">
                    <button
                      onClick={() => toggleExpand(segment.id)}
                      className="flex w-full items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                      {isExpanded ? "Hide rules" : "Show rules"}
                    </button>

                    {isExpanded && (
                      <div className="mt-3 space-y-2">
                        {segment.rules.map((rule, ri) => (
                          <div
                            key={ri}
                            className="rounded-md border border-border bg-muted/20 p-3"
                          >
                            <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
                              Rule {ri + 1}
                              {ri > 0 && (
                                <span className="ml-2 font-normal text-muted-foreground/70">
                                  (OR)
                                </span>
                              )}
                            </p>
                            <div className="space-y-1">
                              {rule.clauses.map((clause, ci) => (
                                <div
                                  key={ci}
                                  className="flex flex-wrap items-center gap-1.5 text-sm"
                                >
                                  {ci > 0 && (
                                    <span className="text-xs font-semibold text-muted-foreground">
                                      AND
                                    </span>
                                  )}
                                  <ClauseDisplay clause={clause} />
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ClauseDisplay({ clause }: { clause: Clause }) {
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

  const opLabel = opLabels[clause.operator] ?? clause.operator;

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge variant="outline" className="font-mono text-xs">
        {clause.attribute}
      </Badge>
      <span className="text-xs text-muted-foreground">
        {negatePrefix}
        {opLabel}
      </span>
      <Badge variant="secondary" className="font-mono text-xs">
        {vals}
      </Badge>
    </span>
  );
}
