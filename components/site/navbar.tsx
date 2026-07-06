import Link from "next/link";
import { Waypoints } from "lucide-react";

import { AuthButton } from "@/components/auth/auth-button";
import { CommandPalette } from "@/components/site/command-palette";
import { NavNew } from "@/components/site/nav-new";
import { PalettePicker } from "@/components/site/palette-picker";
import { ThemeToggle } from "@/components/site/theme-toggle";

export function Navbar() {
  return (
    <header className="z-10 border-b bg-background/80 backdrop-blur">
      <div className="flex h-14 items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <Waypoints className="size-5 text-(--brand)" />
          <span className="text-sm font-semibold tracking-tight">
            Graph Editor
          </span>
        </Link>
        <nav className="flex items-center gap-4 text-sm text-muted-foreground">
          <Link
            href="/library"
            className="transition-colors hover:text-foreground"
          >
            Library
          </Link>
          <Link
            href="/explore"
            className="transition-colors hover:text-foreground"
          >
            Explore
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <CommandPalette />
          <NavNew />
          <div className="flex items-center gap-1">
            <PalettePicker />
            <ThemeToggle />
            <AuthButton />
          </div>
        </div>
      </div>
    </header>
  );
}
