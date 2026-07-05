import type { Metadata } from "next";
import Link from "next/link";
import { PenLine } from "lucide-react";

import { PostCard } from "@/components/posts/post-card";
import {
  EmptyStateCard,
  ListPageHeader,
  ListPageShell,
} from "@/components/site/list-page";
import { Button } from "@/components/ui/button";
import { getPostsIndex } from "@/lib/data/posts";

export const metadata: Metadata = { title: "Posts" };
export const dynamic = "force-dynamic";

export default async function PostsPage() {
  const { user, published, drafts } = await getPostsIndex();

  return (
    <ListPageShell>
      <ListPageHeader
        title="Posts"
        description="Write-ups from the community — algorithms explained, graphs to run them on, projects to fork."
        action={
          <Button asChild>
            <Link href={user ? "/posts/new" : "/login?next=/posts/new"}>
              <PenLine /> Write a post
            </Link>
          </Button>
        }
      />

      {user && drafts.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-medium text-muted-foreground">
            Your drafts
          </h2>
          <div className="mt-3 grid gap-3">
            {drafts.map((post) => (
              <PostCard key={post.id} post={post} signedIn={!!user} />
            ))}
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-medium text-muted-foreground">Latest</h2>
        {published.length === 0 ? (
          <EmptyStateCard className="mt-3">
            Nothing published yet — be the first to write about an algorithm.
          </EmptyStateCard>
        ) : (
          <div className="mt-3 grid gap-3">
            {published.map((post) => (
              <PostCard key={post.id} post={post} signedIn={!!user} />
            ))}
          </div>
        )}
      </section>
    </ListPageShell>
  );
}
