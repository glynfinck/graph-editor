"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

const profileSchema = z.object({
  display_name: z.string().trim().min(1, "Display name is required").max(80),
  first_name: z.string().trim().max(80),
  last_name: z.string().trim().max(80),
  avatar_url: z.union([z.literal(""), z.url("Enter a valid URL")]),
});

export async function updateProfile(input: {
  display_name: string;
  first_name: string;
  last_name: string;
  avatar_url: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in first." };

  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  // column-level grants limit the update to display_name, first_name,
  // last_name + avatar_url
  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: parsed.data.display_name,
      first_name: parsed.data.first_name || null,
      last_name: parsed.data.last_name || null,
      avatar_url: parsed.data.avatar_url || null,
    })
    .eq("id", user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings");
  return { ok: true };
}
