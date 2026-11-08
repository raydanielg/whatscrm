ALTER TABLE public.organizations
  ALTER COLUMN currency DROP DEFAULT;

ALTER TABLE public.organizations
  ALTER COLUMN currency DROP NOT NULL;

COMMENT ON COLUMN public.organizations.currency IS
  'ISO currency for this organization. NULL means inherit the platform default '
  'from Super Admin -> Platform Settings -> Localization. Resolution order: '
  'this column, then the platform default, then USD.';
