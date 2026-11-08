
-- Add "manager" role used by CRM policies
ALTER TYPE workspace_role ADD VALUE IF NOT EXISTS 'manager';
