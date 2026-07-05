import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ProfileForm } from "@/components/settings/profile-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getOwnProfile } from "@/lib/data/profiles";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { user, profile } = await getOwnProfile();
  if (!user) redirect("/login?next=/settings");

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Your profile and account.
      </p>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
          <CardDescription>
            How you appear alongside anything you share.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm
            initialDisplayName={profile?.display_name ?? ""}
            initialAvatarUrl={profile?.avatar_url ?? ""}
          />
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
          <CardDescription>
            Signed in as {user.email ?? "an OAuth account"} — use the avatar
            menu in the top bar to sign out.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
