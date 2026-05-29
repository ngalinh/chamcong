alter table public.dropship_revenue
  add column if not exists customer_group text;
