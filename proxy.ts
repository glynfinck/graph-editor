import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static assets and images. The session
     * only needs refreshing on paths that can read it.
     */
    "/((?!_next/static|_next/image|favicon.ico|python-worker.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|py)$).*)",
  ],
};
