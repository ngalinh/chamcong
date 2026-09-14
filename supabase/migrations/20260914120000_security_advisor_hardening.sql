begin;

-- Keep the function OID so existing public/storage policies retain dependencies.
create schema private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;
alter function public.is_admin() set search_path = '';
alter function public.is_admin() set schema private;
revoke all on function private.is_admin() from public;
-- Existing policies apply to anon too; auth.uid() is NULL for signed-out users.
grant execute on function private.is_admin() to anon, authenticated, service_role;

alter table public.profit_total_shares enable row level security;
revoke all on table public.profit_total_shares from anon;
revoke truncate, references, trigger on table public.profit_total_shares from authenticated;
grant select, insert, update, delete on table public.profit_total_shares to authenticated, service_role;
create policy profit_total_shares_admin_all
  on public.profit_total_shares for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

commit;
