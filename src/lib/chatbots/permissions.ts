/**
 * Chatbot role-based permissions.
 *
 * Aligns with RLS on `public.chatbots` and friends:
 *   - Read:   any workspace member
 *   - Write:  owner | admin | manager
 *   - Purge:  owner | admin only (hard delete is destructive)
 */
export type ChatbotRole = "owner" | "admin" | "manager" | "agent" | "viewer" | null | undefined;

export const canViewChatbots = (r: ChatbotRole) =>
  r === "owner" || r === "admin" || r === "manager" || r === "agent" || r === "viewer";

export const canManageChatbots = (r: ChatbotRole) =>
  r === "owner" || r === "admin" || r === "manager";

export const canDeleteChatbot = (r: ChatbotRole) => canManageChatbots(r);
export const canDeployChatbot = (r: ChatbotRole) => canManageChatbots(r);
export const canDuplicateChatbot = (r: ChatbotRole) => canManageChatbots(r);
export const canRenameChatbot = (r: ChatbotRole) => canManageChatbots(r);
export const canChangeChatbotStatus = (r: ChatbotRole) => canManageChatbots(r);

/** Permanent delete is admin-only. */
export const canPurgeChatbot = (r: ChatbotRole) => r === "owner" || r === "admin";

/** Uninstall a template-installed bot: same bar as purge. */
export const canUninstallTemplateBot = (r: ChatbotRole) => canPurgeChatbot(r);

export const CHATBOT_MANAGE_ROLES = ["owner", "admin", "manager"] as const;
export const CHATBOT_PURGE_ROLES = ["owner", "admin"] as const;
