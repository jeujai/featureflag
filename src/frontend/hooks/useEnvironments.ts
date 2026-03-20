import { useCallback, useEffect, useState } from "react";
import type { Environment } from "@shared/types";
import { api } from "@/lib/api";

const ENV_KEY = "ld-panel-environment";

export function useEnvironments(projectId: string | null) {
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [selectedEnvId, setSelectedEnvIdState] = useState<string | null>(
    () => localStorage.getItem(ENV_KEY),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEnvironments = useCallback(async () => {
    if (!projectId) {
      setEnvironments([]);
      return;
    }
    try {
      setLoading(true);
      const data = await api.get<Environment[]>(`/projects/${projectId}/environments`);
      setEnvironments(data);

      // Auto-select first env if none selected or selected no longer exists
      if (data.length > 0) {
        const stored = localStorage.getItem(ENV_KEY);
        const exists = data.some((e) => e.id === stored);
        if (!exists) {
          setSelectedEnvIdState(data[0].id);
          localStorage.setItem(ENV_KEY, data[0].id);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch environments");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchEnvironments();
  }, [fetchEnvironments]);

  const setSelectedEnvId = useCallback((id: string) => {
    setSelectedEnvIdState(id);
    localStorage.setItem(ENV_KEY, id);
  }, []);

  const selectedEnvironment = environments.find((e) => e.id === selectedEnvId) ?? null;

  return {
    environments,
    selectedEnvironment,
    selectedEnvId,
    setSelectedEnvId,
    loading,
    error,
    refetch: fetchEnvironments,
  };
}
