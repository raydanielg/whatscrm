-- Make the platform default currency actually reachable.
--
-- `organizations.currency` was added (20260717100753) as
-- `text NOT NULL DEFAULT 'USD'`. Both currency resolvers — `useTenantCurrency()`
-- on the client and the new `resolveWorkspaceCurrency()` on the server — read
-- the organization first and only fall through to the platform default when the
-- organization has none:
--
--     org currency -> platform default (Super Admin -> Localization) -> "USD"
--
-- Because the column is NOT NULL with a default, every organization ever
-- created already holds a value, so the second step was unreachable. Changing
-- the currency in Super Admin -> Platform Settings -> Localization therefore had
-- no visible effect anywhere, which is the reported "it still says US dollars
-- even though I changed the currency in super admin".
--
-- Fix: let the column be NULL, which is the only way to represent "inherit the
-- platform default". New organizations (the switcher inserts name/slug/owner_id
-- only) now come out NULL and inherit.
--
-- Existing values are deliberately NOT rewritten. A stored 'USD' may be a real
-- choice, and this migration cannot tell that apart from the schema default it
-- was handed. Rewriting them would silently change the currency on live invoices
-- and quotes for every tenant that genuinely uses dollars. An organization that
-- wants to inherit instead sets its currency to NULL (Workspace ->
-- Organization), or an operator clears them deliberately:
--
--     UPDATE public.organizations SET currency = NULL WHERE currency = 'USD';

ALTER TABLE public.organizations
  ALTER COLUMN currency DROP DEFAULT;

ALTER TABLE public.organizations
  ALTER COLUMN currency DROP NOT NULL;

COMMENT ON COLUMN public.organizations.currency IS
  'ISO currency for this organization. NULL means inherit the platform default '
  'from Super Admin -> Platform Settings -> Localization. Resolution order: '
  'this column, then the platform default, then USD.';
