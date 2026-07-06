"use client";

import Link, { useLinkStatus } from "next/link";

import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

function PendingDot() {
  const { pending } = useLinkStatus();
  return pending ? <Spinner className="size-3" /> : null;
}

/**
 * A nav link that shows a small spinner while its navigation is pending —
 * immediate feedback when the destination's server render is slow.
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
    <Link
      href={href}
      className={cn("inline-flex items-center gap-1.5", className)}
    >
      {children}
      <PendingDot />
    </Link>
  );
}
