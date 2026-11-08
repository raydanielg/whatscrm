import { useSyncExternalStore } from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Building2, TriangleAlert } from 'lucide-react';
import { useCurrentWorkspace } from '@/hooks/use-workspace';
import { readActiveOrgId, subscribeActiveTenant } from '@/lib/tenant/active-tenant';

/**
 * Resolves which workspace vCard writes will actually land in, and whether
 * that workspace is a fallback (i.e. it is not linked to the active
 * organization — typical for shared demo sessions and legacy workspaces).
 */
export function useWorkspaceContext() {
  const { active, isLoading } = useCurrentWorkspace();
  const activeOrgId = useSyncExternalStore(subscribeActiveTenant, readActiveOrgId, () => null);
  const isFallback = !!active && !!activeOrgId && active.organization_id !== activeOrgId;
  return { workspace: active, activeOrgId, isFallback, isLoading };
}

/**
 * Visible "saves go here" indicator for the vCard and versioning screens.
 * Makes the fallback workspace explicit instead of silent.
 */
export function WorkspaceContextIndicator({ className, compact }: { className?: string; compact?: boolean }) {
  const { workspace, isFallback, isLoading } = useWorkspaceContext();

  if (isLoading && !workspace) {
    return (
      <span className={`text-xs text-muted-foreground ${className ?? ''}`}>Resolving workspace</span>
    );
  }

  if (!workspace) {
    return (
      <Badge variant="destructive" className={`gap-1.5 font-normal ${className ?? ''}`}>
        <TriangleAlert className="h-3.5 w-3.5" />
        No workspace available
      </Badge>
    );
  }

  const label = compact ? workspace.name : `Saving to ${workspace.name}`;
  const tip = isFallback
    ? `“${workspace.name}” is not linked to your active organization, so it is used as a fallback. All cards and versions you create here are stored in this workspace.`
    : `Cards and versions are stored in “${workspace.name}”, the workspace linked to your active organization.`;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant={isFallback ? 'outline' : 'secondary'}
            className={`gap-1.5 font-normal ${isFallback ? 'border-amber-500/60 text-amber-700 dark:text-amber-400' : ''} ${className ?? ''}`}
          >
            {isFallback ? <TriangleAlert className="h-3.5 w-3.5" /> : <Building2 className="h-3.5 w-3.5" />}
            <span className="truncate max-w-[16rem]">{label}</span>
            {isFallback && <span className="text-[11px] uppercase tracking-wide">fallback</span>}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{tip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
