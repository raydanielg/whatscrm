# Migrations

SQL migrations are the source of truth for schema. Never edit generated types by hand — regenerate after each migration.

Conventions:
- Timestamped filename: `YYYYMMDDHHMMSS_short_description.sql`.
- Every `CREATE TABLE public.*` is followed by GRANT statements and RLS enable + policies in the same migration.
- Every domain table carries `workspace_id uuid not null references public.workspaces(id) on delete cascade`.
- Prefer security-definer helpers (`is_workspace_member`, `has_workspace_role`) over inline joins in policies.
