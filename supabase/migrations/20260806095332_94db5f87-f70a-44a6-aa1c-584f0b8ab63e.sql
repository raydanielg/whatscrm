CREATE UNIQUE INDEX IF NOT EXISTS plan_gateway_prices_price_unique_per_mode
  ON public.plan_gateway_prices (provider_id, mode, external_price_id)
  WHERE external_price_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS plan_gateway_prices_checkout_url_unique_per_mode
  ON public.plan_gateway_prices (provider_id, mode, checkout_url)
  WHERE checkout_url IS NOT NULL;