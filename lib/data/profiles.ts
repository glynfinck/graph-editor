import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/helpers";

export type Profile = Tables<"profiles">;

/** The caller's profile row (auto-created on sign-up), or nulls when anon. */
export async function getOwnProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, profile: null };

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;

  return { user, profile: data };
}
