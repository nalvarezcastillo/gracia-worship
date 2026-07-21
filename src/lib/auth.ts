import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function hasAuthenticatedUser() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getClaims();
    return !error && Boolean(data?.claims?.sub);
  } catch {
    return false;
  }
}
