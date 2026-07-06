import { Waypoints } from "lucide-react";

import { AuthButton } from "@/components/auth/auth-button";
import { CommandPalette } from "@/components/site/command-palette";
import { NavLink } from "@/components/site/nav-link";
import { NavNew } from "@/components/site/nav-new";
import { PalettePicker } from "@/components/site/palette-picker";
import { ThemeToggle } from "@/components/site/theme-toggle";

export function Navbar() {
  return (
    <header className="z-10 border-b bg-background/80 backdrop-blur">
      <div className="flex h-14 items-center gap-6 px-4 sm:px-6">
        <NavLink href="/" className="gap-2.5">
          <Waypoints className="size-5 text-(--brand)" />
          <span className="text-sm font-semibold tracking-tight">
            Graph Editor
          </span>
        </NavLink>
        <nav className="flex items-center gap-4 text-sm text-muted-foreground">
          <NavLink
            href="/library"
            className="transition-colors hover:text-foreground"
          >
            Library
          </NavLink>
          <NavLink
            href="/explore"
            className="transition-colors hover:text-foreground"
          >
            Explore
          </NavLink>
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
