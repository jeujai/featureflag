import { Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import Layout from "@/components/Layout";
import DashboardPage from "@/pages/DashboardPage";
import FlagsPage from "@/pages/FlagsPage";
import FlagDetailPage from "@/pages/FlagDetailPage";
import SegmentsPage from "@/pages/SegmentsPage";
import EnvironmentsPage from "@/pages/EnvironmentsPage";
import EvaluatePage from "@/pages/EvaluatePage";
import { useProjects } from "@/hooks/useProjects";
import { useEnvironments } from "@/hooks/useEnvironments";

function App() {
  const {
    projects,
    selectedProject,
    selectedProjectId,
    setSelectedProjectId,
  } = useProjects();

  const {
    environments,
    selectedEnvironment,
    setSelectedEnvId,
  } = useEnvironments(selectedProjectId);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster richColors position="top-right" />
      <Routes>
        <Route
          element={
            <Layout
              projects={projects}
              selectedProject={selectedProject}
              onSelectProject={setSelectedProjectId}
              environments={environments}
              selectedEnvironment={selectedEnvironment}
              onSelectEnvironment={setSelectedEnvId}
            />
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="flags" element={<FlagsPage />} />
          <Route path="flags/:flagKey" element={<FlagDetailPage />} />
          <Route path="segments" element={<SegmentsPage />} />
          <Route path="environments" element={<EnvironmentsPage />} />
          <Route path="evaluate" element={<EvaluatePage />} />
        </Route>
      </Routes>
    </div>
  );
}

export default App;
