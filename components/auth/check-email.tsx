"use client";

import { useEffect, useState } from "react";
import { Loader2, MailCheck } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

const RESEND_COOLDOWN_SECONDS = 30;

/** Shown after a signup that needs email confirmation. Offers a cooldown-gated
 *  resend and a way back to the form to use a different address. */
export function CheckEmail({
  email,
  next,
  onBack,
}: {
  email: string;
  next: string;
  onBack: () => void;
}) {
  const [seconds, setSeconds] = useState(0);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<{
    variant: "default" | "destructive";
    message: string;
  } | null>(null);

  useEffect(() => {
    if (seconds <= 0) return;
    const id = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [seconds]);

  async function resend() {
    setSending(true);
    setStatus(null);
    const supabase = createClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    setSending(false);
    if (error) {
      setStatus({ variant: "destructive", message: error.message });
      return;
    }
    setStatus({ variant: "default", message: "Sent — check your inbox." });
    setSeconds(RESEND_COOLDOWN_SECONDS);
  }

  return (
    <div className="grid gap-4 text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10">
        <MailCheck className="size-6 text-primary" />
      </div>
      <div className="grid gap-1.5">
        <h2 className="text-lg font-semibold">Check your email</h2>
        <p className="text-sm text-muted-foreground">
          We sent a confirmation link to{" "}
          <span className="font-medium text-foreground">{email}</span>. Click it
          to finish setting up your account.
        </p>
      </div>

      {status && (
        <Alert variant={status.variant} className="text-left">
          <AlertDescription>{status.message}</AlertDescription>
        </Alert>
      )}

      <Button
        variant="outline"
        onClick={resend}
        disabled={sending || seconds > 0}
      >
        {sending && <Loader2 className="animate-spin" />}
        {seconds > 0 ? `Resend in ${seconds}s` : "Resend email"}
      </Button>

      <p className="text-xs text-muted-foreground">
        Didn&apos;t get it? Check your spam folder.
      </p>

      <button
        type="button"
        onClick={onBack}
        className="text-sm text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:underline"
      >
        Use a different email
      </button>
    </div>
  );
}
