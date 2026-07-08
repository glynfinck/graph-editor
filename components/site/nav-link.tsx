import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * A styled nav link. Loading feedback for a slow destination is handled by
 * that route's `loading.tsx` skeleton (e.g. app/library/loading.tsx,
 * app/explore/loading.tsx) — no inline spinner here, so a pending navigation
 * never widens the link or shoves sibling nav items sideways.
 */
export function NavLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={cn("inline-flex items-center", className)}>
      {children}
    </Link>
  );
}
