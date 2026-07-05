import type { Metadata } from "next";

import { GraphCard } from "@/components/graphs/graph-card";
import {
  CardGrid,
  EmptyStateCard,
  ListPageHeader,
  ListPageShell,
} from "@/components/site/list-page";
import { getPublicGraphs } from "@/lib/data/graphs";

export const metadata: Metadata = { title: "Explore" };
export const dynamic = "force-dynamic";

export default async function ExplorePage() {
  const { user, samples, community } = await getPublicGraphs();

  return (
    <ListPageShell>
      <ListPageHeader
        title="Explore"
        description="Public graphs from the community and the built-in samples — open one to run code against it. Community graphs are ranked by likes."
      />

      <section className="mt-8">
        <h2 className="text-sm font-medium text-muted-foreground">Samples</h2>
        <CardGrid className="mt-3">
          {samples.map((graph) => (
            <GraphCard
              key={graph.id}
              graph={graph}
              canDelete={false}
              signedIn={!!user}
            />
          ))}
        </CardGrid>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-muted-foreground">Community</h2>
        {community.length === 0 ? (
          <EmptyStateCard className="mt-3">
            No community graphs yet — public graphs show up here for everyone
            to explore.
          </EmptyStateCard>
        ) : (
          <CardGrid className="mt-3">
            {community.map((graph) => (
              <GraphCard
                key={graph.id}
                graph={graph}
                canDelete={false}
                signedIn={!!user}
              />
            ))}
          </CardGrid>
        )}
      </section>
    </ListPageShell>
  );
}
