"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { z } from "zod";

import { PasswordInput } from "@/components/auth/password-input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const MIN_PASSWORD_LENGTH = 8;

const signUpSchema = z
  .object({
    firstName: z.string().trim().min(1, "First name is required").max(80),
    lastName: z.string().trim().min(1, "Last name is required").max(80),
    email: z.email("Enter a valid email"),
    password: z
      .string()
      .min(MIN_PASSWORD_LENGTH, `At least ${MIN_PASSWORD_LENGTH} characters`),
    confirm: z.string(),
  })
  .refine((data) => data.password === data.confirm, {
    message: "Passwords don't match",
    path: ["confirm"],
  });

type Field = "firstName" | "lastName" | "email" | "password" | "confirm";
type Values = Record<Field, string>;

const EMPTY: Values = {
  firstName: "",
  lastName: "",
  email: "",
  password: "",
  confirm: "",
};

export function SignUpForm({
  next,
  disabled,
  onSignedUp,
}: {
  next: string;
  disabled?: boolean;
  onSignedUp: (email: string) => void;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function update(field: Field, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      if (!prev[field] && !prev.confirm) return prev;
      const next = { ...prev };
      delete next[field];
      // Clear a "passwords don't match" error as soon as they line up again.
      if (field === "password" || field === "confirm") {
        const password = field === "password" ? value : values.password;
        const confirm = field === "confirm" ? value : values.confirm;
        if (password === confirm) delete next.confirm;
      }
      return next;
    });
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const parsed = signUpSchema.safeParse(values);
    if (!parsed.success) {
      const fieldErrors: Partial<Record<Field, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as Field | undefined;
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setPending(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        data: {
          first_name: parsed.data.firstName,
          last_name: parsed.data.lastName,
          full_name: `${parsed.data.firstName} ${parsed.data.lastName}`.trim(),
        },
      },
    });

    if (error) {
      setFormError(error.message);
      setPending(false);
      return;
    }
    // Confirmations disabled (e.g. some environments) → straight in.
    if (data.session) {
      router.push(next);
      router.refresh();
      return;
    }
    onSignedUp(parsed.data.email);
  }

  const passwordMet = values.password.length >= MIN_PASSWORD_LENGTH;

  return (
    <form className="grid gap-3" onSubmit={onSubmit} noValidate>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="signup-first-name">First name</Label>
          <Input
            id="signup-first-name"
            autoComplete="given-name"
            value={values.firstName}
            onChange={(e) => update("firstName", e.target.value)}
            aria-invalid={!!errors.firstName}
            aria-describedby={
              errors.firstName ? "signup-first-name-error" : undefined
            }
          />
          {errors.firstName && (
            <p
              id="signup-first-name-error"
              className="text-xs text-destructive"
            >
              {errors.firstName}
            </p>
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="signup-last-name">Last name</Label>
          <Input
            id="signup-last-name"
            autoComplete="family-name"
            value={values.lastName}
            onChange={(e) => update("lastName", e.target.value)}
            aria-invalid={!!errors.lastName}
            aria-describedby={
              errors.lastName ? "signup-last-name-error" : undefined
            }
          />
          {errors.lastName && (
            <p id="signup-last-name-error" className="text-xs text-destructive">
              {errors.lastName}
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="signup-email">Email</Label>
        <Input
          id="signup-email"
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={(e) => update("email", e.target.value)}
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? "signup-email-error" : undefined}
        />
        {errors.email && (
          <p id="signup-email-error" className="text-xs text-destructive">
            {errors.email}
          </p>
        )}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="signup-password">Password</Label>
        <PasswordInput
          id="signup-password"
          autoComplete="new-password"
          value={values.password}
          onChange={(e) => update("password", e.target.value)}
          aria-invalid={!!errors.password}
          aria-describedby="signup-password-hint"
        />
        <p
          id="signup-password-hint"
          className={cn(
            "flex items-center gap-1 text-xs",
            errors.password
              ? "text-destructive"
              : passwordMet
                ? "text-foreground"
                : "text-muted-foreground",
          )}
        >
          {passwordMet ? (
            <Check className="size-3" />
          ) : (
            <span className="inline-block size-1.5 rounded-full bg-current opacity-60" />
          )}
          At least {MIN_PASSWORD_LENGTH} characters
        </p>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="signup-confirm">Confirm password</Label>
        <PasswordInput
          id="signup-confirm"
          autoComplete="new-password"
          value={values.confirm}
          onChange={(e) => update("confirm", e.target.value)}
          aria-invalid={!!errors.confirm}
          aria-describedby={errors.confirm ? "signup-confirm-error" : undefined}
        />
        {errors.confirm && (
          <p id="signup-confirm-error" className="text-xs text-destructive">
            {errors.confirm}
          </p>
        )}
      </div>

      <Button
        type="submit"
        disabled={pending || disabled}
        className="mt-1"
      >
        {pending && <Loader2 className="animate-spin" />}
        Create account
      </Button>

      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
