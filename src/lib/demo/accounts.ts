/**
 * Centralized demo account metadata. Consumed by /auth, /demo-login, the demo
 * banner, and the provisioner server function. Update this list to change what
 * visitors see.
 *
 * Passwords are deliberately NOT here. This module is imported by the root
 * layout (the demo banner) and `mode.ts`, so anything in it ships in the main
 * client bundle of every deployment — production included. The published
 * passwords live in `./credentials`, which is only reachable from the
 * demo-only code paths (lazy-loaded credentials picker, provisioner).
 */
export type DemoAccount = {
  key: "user" | "agent" | "admin";
  label: string;
  email: string;
  description: string;
  /** Platform role assigned via public.user_roles (app_role enum). */
  platformRole?: "superadmin" | "support";
  accent: string; // tailwind gradient classes
  redirect: string;
};

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    key: "user",
    label: "User",
    email: "user@demo.com",
    description: "End-user workspace view. Read-only access across most surfaces.",
    accent: "from-sky-500/15 to-sky-500/5",
    redirect: "/dashboard",
  },
  {
    key: "agent",
    label: "Agent",
    email: "agent@demo.com",
    description: "Inbox operator. Reply to conversations, manage contacts, run tasks.",
    platformRole: "support",
    accent: "from-emerald-500/15 to-emerald-500/5",
    redirect: "/dashboard",
  },
  {
    key: "admin",
    label: "Admin",
    email: "admin@demo.com",
    description: "Full administrator. Access Super Admin, billing, plugins, settings.",
    platformRole: "superadmin",
    accent: "from-violet-500/15 to-violet-500/5",
    redirect: "/dashboard",
  },
];

export const DEMO_MODE_STORAGE_KEY = "wacrm.demo-mode.v1";
