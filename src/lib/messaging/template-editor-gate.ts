/**
 * Preconditions for opening the WhatsApp template editor.
 *
 * "Create Meta Template" is a direct route, so a user can land on it before
 * the workspace, role or account queries have settled — or without ever
 * satisfying them. Previously the editor was rendered behind a bare
 * `creating && isAdmin && accountId && workspaceId` guard: when any of those
 * was falsy the page simply showed the template list, which is
 * indistinguishable from a broken button.
 *
 * This resolves the intent into one explicit state so the caller can render a
 * reason instead of nothing. It deliberately does NOT relax the permission
 * rule — only admins and owners may create templates, exactly as before.
 *
 * Pure module: no React, no I/O, so the ordering is directly testable.
 */

export type TemplateEditorBlockReason = "workspace" | "permission" | "no-account";

export type TemplateEditorGate =
  /** A dependency is still resolving — show a placeholder, never a reason. */
  | { state: "loading" }
  /** Every precondition holds; the editor may mount. */
  | { state: "ready" }
  | {
      state: "blocked";
      reason: TemplateEditorBlockReason;
      title: string;
      description: string;
    };

export interface TemplateEditorGateInput {
  workspacePending: boolean;
  workspaceId: string | undefined | null;
  rolePending: boolean;
  isAdmin: boolean;
  accountsPending: boolean;
  accountId: string | undefined | null;
}

/**
 * Checks are ordered by dependency: role and accounts are both workspace
 * scoped, so a missing workspace must be reported before either of them, and
 * each `pending` is consulted before the value it produces — otherwise a slow
 * query renders as "you lack permission" and then flips, which reads as a bug.
 */
export function templateEditorGate(input: TemplateEditorGateInput): TemplateEditorGate {
  if (input.workspacePending) return { state: "loading" };
  if (!input.workspaceId) {
    return {
      state: "blocked",
      reason: "workspace",
      title: "No active workspace",
      description:
        "The template editor needs an active workspace and none could be loaded. Reload the page, or switch workspace and back.",
    };
  }

  if (input.rolePending) return { state: "loading" };
  if (!input.isAdmin) {
    return {
      state: "blocked",
      reason: "permission",
      title: "You need admin access to create templates",
      description:
        "WhatsApp message templates can only be created by a workspace owner or admin. Ask one of them to create it, or to change your role.",
    };
  }

  if (input.accountsPending) return { state: "loading" };
  if (!input.accountId) {
    return {
      state: "blocked",
      reason: "no-account",
      title: "No WhatsApp account connected",
      description:
        "Connect a WhatsApp Business Account under Communications → WhatsApp Accounts before creating a template.",
    };
  }

  return { state: "ready" };
}
