"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FolderCode, Newspaper, Plus, Waypoints } from "lucide-react";

import { NewGraphDialog } from "@/components/graphs/new-graph-dialog";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";

/**
 * Global "+ New" menu — creation lives in the navbar so it isn't scattered
 * across the list pages. Auth resolves in the browser (same trick as
 * AuthButton) and the menu simply hides for signed-out visitors.
 */
export function NavNew() {
  const [signedIn, setSignedIn] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const [graphOpen, setGraphOpen] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(({ data }) => setSignedIn(!!data.user));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(!!session?.user);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (!signedIn) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline">
            <Plus /> New
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setProjectOpen(true)}>
            <FolderCode /> New project
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setGraphOpen(true)}>
            <Waypoints /> New graph
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/posts/new">
              <Newspaper /> Write a post
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <NewProjectDialog open={projectOpen} onOpenChange={setProjectOpen} />
      <NewGraphDialog open={graphOpen} onOpenChange={setGraphOpen} />
    </>
  );
}
