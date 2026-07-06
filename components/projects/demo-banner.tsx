"use client";

import Link from "next/link";
import { useState } from "react";
import { TriangleAlert, X } from "lucide-react";

import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * Signed-out visitors edit/run the demo entirely in-memory. This bar is the
 * honest signal that nothing persists; Save routes them to sign in.
 */
export function DemoBanner() {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;

  return (
    <Alert
      variant="warning"
      className="shrink-0 rounded-none border-x-0 border-t-0 px-4 py-2"
    >
      <TriangleAlert />
      <AlertDescription>
        You’re in demo mode — nothing here is saved.{" "}
        <Link href="/login?next=/projects">Sign in to save</Link> your work.
      </AlertDescription>
      <AlertAction>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Dismiss"
          onClick={() => setVisible(false)}
        >
          <X />
        </Button>
      </AlertAction>
    </Alert>
  );
}
