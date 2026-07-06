"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useTransition,
} from "react";

import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

type ListNav = {
  pending: boolean;
  navigate: (href: string, opts?: { replace?: boolean; scroll?: boolean }) => void;
};

const ListNavContext = createContext<ListNav | null>(null);

/**
 * Shared pending state for the list pages. Same-route searchParam changes
 * (tabs, sort, search, pagination) don't re-trigger loading.tsx — the old
 * tree stays mounted until the server responds — so the toolbar and pager
 * route their navigations through one transition here, and PendingOverlay
 * dims the stale results while it runs.
 */
export function ListNavProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const navigate = useCallback<ListNav["navigate"]>(
    (href, { replace = false, scroll = false } = {}) => {
      startTransition(() => {
        if (replace) router.replace(href, { scroll });
        else router.push(href, { scroll });
      });
    },
    [router],
  );

  const value = useMemo(() => ({ pending, navigate }), [pending, navigate]);
  return (
    <ListNavContext.Provider value={value}>{children}</ListNavContext.Provider>
  );
}

/** Null outside a ListNavProvider — callers fall back to a bare router call. */
export function useListNav(): ListNav | null {
  return useContext(ListNavContext);
}

/**
 * Dims the (server-rendered) results while a list navigation is pending.
 * The 150ms delays keep fast responses from flickering the overlay.
 */
export function PendingOverlay({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const pending = useListNav()?.pending ?? false;
  return (
    <div aria-busy={pending} className={cn("relative", className)}>
      <div
        className={cn(
          "transition-opacity duration-200",
          pending && "pointer-events-none opacity-50 [transition-delay:150ms]",
        )}
      >
        {children}
      </div>
      {pending && (
        <div className="animate-in fade-in fill-mode-both absolute inset-0 z-10 flex items-start justify-center pt-24 [animation-delay:150ms]">
          <Spinner className="size-5" />
        </div>
      )}
    </div>
  );
}
