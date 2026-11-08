import { useWorkspaceRole, useCurrentWorkspace } from "@/hooks/use-workspace";
import {
  canManageChatbots,
  canDeleteChatbot,
  canPurgeChatbot,
  canDeployChatbot,
  canDuplicateChatbot,
  canRenameChatbot,
  canChangeChatbotStatus,
  canUninstallTemplateBot,
  type ChatbotRole,
} from "@/lib/chatbots/permissions";

/**
 * UI-side permission gate for the current user in the active workspace.
 * Server functions and RLS still enforce these rules independently.
 */
export function useChatbotPermissions(workspaceIdOverride?: string) {
  const { active } = useCurrentWorkspace();
  const wsId = workspaceIdOverride ?? active?.id;
  const { data: role, isLoading } = useWorkspaceRole(wsId);
  const r = role as ChatbotRole;
  return {
    role: r,
    isLoading,
    canManage: canManageChatbots(r),
    canDelete: canDeleteChatbot(r),
    canPurge: canPurgeChatbot(r),
    canDeploy: canDeployChatbot(r),
    canDuplicate: canDuplicateChatbot(r),
    canRename: canRenameChatbot(r),
    canChangeStatus: canChangeChatbotStatus(r),
    canUninstallTemplate: canUninstallTemplateBot(r),
  };
}
