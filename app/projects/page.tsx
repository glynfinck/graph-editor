import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** The projects list moved into the library; the route stays for old links. */
export default async function ProjectsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // signed-out visitors get the interactive demo instead of an empty list
  redirect(user ? "/library?tab=projects" : "/projects/demo");
}
