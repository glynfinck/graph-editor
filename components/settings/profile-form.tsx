"use client";

import { useState, useTransition } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProfile } from "@/lib/actions/profiles";

export function ProfileForm({
  initialDisplayName,
  initialFirstName,
  initialLastName,
  initialAvatarUrl,
}: {
  initialDisplayName: string;
  initialFirstName: string;
  initialLastName: string;
  initialAvatarUrl: string;
}) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await updateProfile({
        display_name: displayName,
        first_name: firstName,
        last_name: lastName,
        avatar_url: avatarUrl,
      });
      if (result.ok) toast.success("Profile saved");
      else toast.error(result.error);
    });
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <div className="flex items-center gap-4">
        <Avatar className="size-14">
          <AvatarImage src={avatarUrl || undefined} alt={displayName} />
          <AvatarFallback>
            {(displayName || "?").slice(0, 1).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="grid flex-1 gap-1.5">
          <Label htmlFor="avatar-url">Avatar URL</Label>
          <Input
            id="avatar-url"
            type="url"
            placeholder="https://…"
            value={avatarUrl}
            onChange={(event) => setAvatarUrl(event.target.value)}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="first-name">First name</Label>
          <Input
            id="first-name"
            autoComplete="given-name"
            maxLength={80}
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="last-name">Last name</Label>
          <Input
            id="last-name"
            autoComplete="family-name"
            maxLength={80}
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
          />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="display-name">Display name</Label>
        <Input
          id="display-name"
          required
          maxLength={80}
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Shown alongside anything you share.
        </p>
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Save />}
          Save
        </Button>
      </div>
    </form>
  );
}
