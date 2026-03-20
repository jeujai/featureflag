import { useState, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import {
  Globe,
  Key,
  Copy,
  Eye,
  EyeOff,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Project, Environment } from "@shared/types";

interface LayoutContext {
  selectedProject: Project | null;
  selectedEnvironment: Environment | null;
  environments: Environment[];
}

function envBadgeColor(key: string): string {
  const k = key.toLowerCase();
  if (k.includes("prod"))
    return "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300";
  if (k.includes("stag"))
    return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300";
  return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300";
}

function maskKey(key: string): string {
  if (!key || key.length < 12) return "sdk-****";
  return `${key.slice(0, 4)}****${key.slice(-4)}`;
}

export default function EnvironmentsPage() {
  const { selectedProject, environments } =
    useOutletContext<LayoutContext>();

  if (!selectedProject) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <Globe className="mb-4 h-12 w-12 opacity-40" />
        <p className="text-lg font-medium">No project selected</p>
        <p className="mt-1 text-sm">
          Select a project from the sidebar to get started.
        </p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Environments
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage environments and SDK keys for {selectedProject.name}
          </p>
        </div>

        {/* Empty state */}
        {environments.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
            <Globe className="mb-4 h-12 w-12 text-muted-foreground opacity-40" />
            <p className="text-lg font-medium text-foreground">
              No environments yet
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create an environment to start configuring flags.
            </p>
          </div>
        )}

        {/* Environment cards */}
        {environments.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {environments.map((env) => (
              <EnvironmentCard key={env.id} environment={env} />
            ))}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

function EnvironmentCard({ environment }: { environment: Environment }) {
  const [serverKeyVisible, setServerKeyVisible] = useState(false);
  const [clientKeyVisible, setClientKeyVisible] = useState(false);

  const copyToClipboard = useCallback(async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("SDK key copied to clipboard");
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  }, []);

  return (
    <Card className="transition-shadow duration-200 hover:shadow-md">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base font-medium">
            {environment.name}
          </CardTitle>
          <Badge
            className={`border-0 text-xs ${envBadgeColor(environment.key)}`}
          >
            {environment.key}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Server SDK Key */}
        <SdkKeyRow
          label="Server SDK Key"
          sdkKey={environment.sdkKey}
          visible={serverKeyVisible}
          onToggleVisibility={() => setServerKeyVisible((v) => !v)}
          onCopy={() => copyToClipboard(environment.sdkKey)}
        />

        {/* Client SDK Key */}
        <SdkKeyRow
          label="Client SDK Key"
          sdkKey={environment.clientSdkKey}
          visible={clientKeyVisible}
          onToggleVisibility={() => setClientKeyVisible((v) => !v)}
          onCopy={() => copyToClipboard(environment.clientSdkKey)}
        />
      </CardContent>
    </Card>
  );
}

function SdkKeyRow({
  label,
  sdkKey,
  visible,
  onToggleVisibility,
  onCopy,
}: {
  label: string;
  sdkKey: string;
  visible: boolean;
  onToggleVisibility: () => void;
  onCopy: () => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5">
        <Key className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <code className="flex-1 truncate rounded bg-muted px-2 py-1 font-mono text-xs">
          {visible ? sdkKey : maskKey(sdkKey)}
        </code>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={onToggleVisibility}
              aria-label={visible ? "Hide key" : "Reveal key"}
            >
              {visible ? (
                <EyeOff className="h-3.5 w-3.5" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {visible ? "Hide" : "Reveal"}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={onCopy}
              aria-label="Copy key"
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Copy</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
