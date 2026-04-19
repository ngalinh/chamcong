import { createClient } from "@supabase/supabase-js";

// Service-role client — bypass RLS. CHỈ dùng trong route handlers / server actions.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
