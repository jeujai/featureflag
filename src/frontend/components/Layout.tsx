import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  Flag,
  Users,
  Globe,
  FlaskConical,
  Moon,
  Sun,
  Monitor,
  ChevronDown,
  Menu,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useTheme } from "@/hooks/useTheme";
import type { Project, Environment } from "@shared/types";

interface LayoutProps {
  projects: Project[];
  selectedProject: Project | null;
  onSelectProject: (id: string) => void;
  environments: Environment[];
  selectedEnvironment: Environment | null;
  onSelectEnvironment: (id: string) => void;
}

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/flags", label: "Flags", icon: Flag },
  { to: "/segments", label: "Segments", icon: Users },
  { to: "/environments", label: "Environments", icon: Globe },
  { to: "/evaluate", label: "Evaluate", icon: FlaskConical },
];

function envColor(key: string): string {
  const k = key.toLowerCase();
  if (k.includes("prod")) return "bg-green-500";
  if (k.includes("stag")) return "bg-yellow-500";
  return "bg-blue-500";
}

export default function Layout({
  projects,
  selectedProject,
  onSelectProject,
  environments,
  selectedEnvironment,
  onSelectEnvironment,
}: LayoutProps) {
  const { theme, setTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const themeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  const ThemeIcon = themeIcon;

  const nextTheme = () => {
    const order: Array<"light" | "dark" | "system"> = ["light", "dark", "system"];
    const idx = order.indexOf(theme);
    setTheme(order[(idx + 1) % order.length]);
  };

  const sidebar = (
    <div className="flex h-full flex-col">
      {/* Logo / Title */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-4">
        <Flag className="h-6 w-6 text-primary" />
        <span className="text-lg font-semibold tracking-tight">LD Panel</span>
      </div>

      {/* Project Selector */}
      <div className="border-b border-border px-3 py-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-full justify-between text-sm">
              <span className="truncate">{selectedProject?.name ?? "Select project"}</span>
              <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {projects.map((p) => (
              <DropdownMenuItem
                key={p.id}
                onSelect={() => onSelectProject(p.id)}
                className={cn(selectedProject?.id === p.id && "bg-accent")}
              >
                {p.name}
              </DropdownMenuItem>
            ))}
            {projects.length === 0 && (
              <DropdownMenuItem disabled>No projects</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-3">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Environment Switcher */}
      <div className="border-t border-border px-3 py-3">
        <p className="mb-2 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Environment
        </p>
        <div className="space-y-1">
          {environments.map((env) => (
            <button
              key={env.id}
              onClick={() => onSelectEnvironment(env.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
                selectedEnvironment?.id === env.id
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50",
              )}
            >
              <span className={cn("h-2 w-2 rounded-full", envColor(env.key))} />
              {env.name}
            </button>
          ))}
          {environments.length === 0 && (
            <p className="px-3 text-xs text-muted-foreground">No environments</p>
          )}
        </div>
      </div>

      {/* Theme Toggle */}
      <div className="border-t border-border px-3 py-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={nextTheme}
          className="w-full justify-start gap-2 text-muted-foreground"
        >
          <ThemeIcon className="h-4 w-4" />
          <span className="capitalize">{theme} mode</span>
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — desktop */}
      <aside className="hidden w-64 shrink-0 border-r border-border bg-card lg:block">
        {sidebar}
      </aside>

      {/* Sidebar — mobile */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 border-r border-border bg-card transition-transform duration-200 lg:hidden",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="absolute right-2 top-3">
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)}>
            <X className="h-5 w-5" />
          </Button>
        </div>
        {sidebar}
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="flex items-center gap-3 border-b border-border px-4 py-3 lg:hidden">
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <span className="text-sm font-semibold">LD Panel</span>
          {selectedEnvironment && (
            <Badge variant="outline" className="ml-auto text-xs">
              <span className={cn("mr-1.5 inline-block h-2 w-2 rounded-full", envColor(selectedEnvironment.key))} />
              {selectedEnvironment.name}
            </Badge>
          )}
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet context={{ selectedProject, selectedEnvironment, environments }} />
        </main>
      </div>
    </div>
  );
}
