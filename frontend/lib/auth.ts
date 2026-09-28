import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

/**
 * Server-side Supabase client bound to the request cookies.
 */
export async function getUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Read the `is_admin` flag from the user's row.
 *
 * R-14: this column is edited by hand in the Supabase table. It lives in a
 * `profiles` table, which is what the spec assumes, so the column has to exist
 * there. Returns false if the table or column is missing, which keeps the
 * dashboard usable while the schema is still being set up.
 */
export async function getIsAdmin(user: User | null): Promise<boolean> {
  if (!user) return false;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .maybeSingle();

    if (error) return false;
    return Boolean((data as { is_admin?: boolean } | null)?.is_admin);
  } catch {
    return false;
  }
}
