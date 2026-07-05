import Link from "next/link";
import { Waypoints } from "lucide-react";

import { AuthButton } from "@/components/auth/auth-button";
import { PalettePicker } from "@/components/site/palette-picker";
import { ThemeToggle } from "@/components/site/theme-toggle";

export function Navbar() {
  return (
    <header className="z-10 border-b bg-background/80 backdrop-blur">
      <div className="flex h-14 items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex size-6 items-center justify-center rounded-full bg-linear-to-br from-(--brand) to-(--graph-current)">
            <Waypoints className="size-4 text-white" />
          </span>
          <span className="text-sm font-semibold tracking-tight">
            Graph Editor
          </span>
        </Link>
        <nav className="flex items-center gap-4 text-sm text-muted-foreground">
          <Link
            href="/projects"
            className="transition-colors hover:text-foreground"
          >
            Projects
          </Link>
          <Link href="/graphs" className="transition-colors hover:text-foreground">
            Graphs
          </Link>
          <Link
            href="/explore"
            className="transition-colors hover:text-foreground"
          >
            Explore
          </Link>
          <Link href="/posts" className="transition-colors hover:text-foreground">
            Posts
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <PalettePicker />
          <ThemeToggle />
          <AuthButton />
        </div>
      </div>
    </header>
  );
}
