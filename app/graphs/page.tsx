import type { Metadata } from "next";
import Link from "next/link";

import { GraphCard } from "@/components/graphs/graph-card";
import { NewGraphDialog } from "@/components/graphs/new-graph-dialog";
import {
  CardGrid,
  EmptyStateCard,
  ListPageHeader,
  ListPageShell,
} from "@/components/site/list-page";
import { Button } from "@/components/ui/button";
import { getVisibleGraphs } from "@/lib/data/graphs";

export const metadata: Metadata = { title: "My graphs" };
export const dynamic = "force-dynamic";

// Only YOUR graphs live here — samples and community graphs are /explore's
// job, so the two pages stopped duplicating each other.
export default async function GraphsPage() {
  const { user, mine } = await getVisibleGraphs();

  return (
    <ListPageShell>
      <ListPageHeader
        title="My graphs"
        description="Your test-graph library — open one to view it, or edit it inside a project."
        action={
          user ? (
            <NewGraphDialog />
          ) : (
            <Button asChild>
              <Link href="/login?next=/graphs">Sign in to create</Link>
            </Button>
          )
        }
      />

      <section className="mt-8">
        {!user ? (
          <EmptyStateCard>
            Your graphs are private to your account — sign in to see them, or{" "}
            <Link href="/explore" className="text-brand underline underline-offset-4">
              explore the public ones
            </Link>
            .
          </EmptyStateCard>
        ) : mine.length === 0 ? (
          <EmptyStateCard>
            Nothing here yet — create a graph, or duplicate one from{" "}
            <Link href="/explore" className="text-brand underline underline-offset-4">
              Explore
            </Link>
            .
          </EmptyStateCard>
        ) : (
          <CardGrid>
            {mine.map((graph) => (
              <GraphCard
                key={graph.id}
                graph={graph}
                canDelete
                signedIn={!!user}
              />
            ))}
          </CardGrid>
        )}
      </section>
    </ListPageShell>
  );
}
