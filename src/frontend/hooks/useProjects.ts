import { useCallback, useEffect, useState } from "react";
import type { Project } from "@shared/types";
import { api } from "@/lib/api";

const PROJECT_KEY = "ld-panel-project";

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectIdState] = useState<string | null>(
    () => localStorage.getItem(PROJECT_KEY),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.get<Project[]>("/projects");
      setProjects(data);

      // Auto-select first project if none selected or selected no longer exists
      if (data.length > 0) {
        const stored = localStorage.getItem(PROJECT_KEY);
        const exists = data.some((p) => p.id === stored);
        if (!exists) {
          setSelectedProjectIdState(data[0].id);
          localStorage.setItem(PROJECT_KEY, data[0].id);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch projects");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const setSelectedProjectId = useCallback((id: string) => {
    setSelectedProjectIdState(id);
    localStorage.setItem(PROJECT_KEY, id);
  }, []);

  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null;

  return {
    projects,
    selectedProject,
    selectedProjectId,
    setSelectedProjectId,
    loading,
    error,
    refetch: fetchProjects,
  };
}
