
ALTER TABLE public.commerce_carts ADD COLUMN IF NOT EXISTS applied_promotions jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.commerce_carts ADD COLUMN IF NOT EXISTS promo_code text;
ALTER TABLE public.commerce_orders ADD COLUMN IF NOT EXISTS applied_promotions jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE INDEX IF NOT EXISTS commerce_orders_applied_promotions_idx ON public.commerce_orders USING gin (applied_promotions);
