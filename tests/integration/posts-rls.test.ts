/**
 * RLS for posts, post likes and comments: drafts are private, published
 * posts are world-readable but owner-writable, and the DB triggers block
 * project-attachment forgery and published_at spoofing.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@/types/database";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  throw new Error(
    "Integration tests need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in .env.local (run `supabase start`).",
  );
}

const PASSWORD = "test-password-123";
const runTag = Date.now().toString(36);

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function anonClient(): SupabaseClient<Database> {
  return createClient<Database>(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function createSignedInUser(label: string) {
  const email = `post-${label}-${runTag}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;

  const client = anonClient();
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (signInError) throw signInError;

  return { id: data.user.id, client };
}

let alice: Awaited<ReturnType<typeof createSignedInUser>>;
let bob: Awaited<ReturnType<typeof createSignedInUser>>;
let draftId: string;
let publishedId: string;
let bobsProjectId: string;

beforeAll(async () => {
  alice = await createSignedInUser("alice");
  bob = await createSignedInUser("bob");

  const { data: draft, error: draftError } = await alice.client
    .from("posts")
    .insert({ owner_id: alice.id, title: "alice draft", body: "wip" })
    .select("id")
    .single();
  if (draftError) throw draftError;
  draftId = draft.id;

  const { data: pub, error: pubError } = await alice.client
    .from("posts")
    .insert({
      owner_id: alice.id,
      title: "alice published",
      body: "hello",
      is_published: true,
    })
    .select("id")
    .single();
  if (pubError) throw pubError;
  publishedId = pub.id;

  const { data: bobProject, error: bobProjectError } = await bob.client
    .from("projects")
    .insert({ owner_id: bob.id, name: "bob project" })
    .select("id")
    .single();
  if (bobProjectError) throw bobProjectError;
  bobsProjectId = bobProject.id;
});

afterAll(async () => {
  if (alice) await admin.auth.admin.deleteUser(alice.id);
  if (bob) await admin.auth.admin.deleteUser(bob.id);
});

describe("post visibility", () => {
  it("drafts are invisible to other users and anon", async () => {
    const { data: forBob } = await bob.client
      .from("posts")
      .select("id")
      .eq("id", draftId)
      .maybeSingle();
    expect(forBob).toBeNull();

    const { data: forAnon } = await anonClient()
      .from("posts")
      .select("id")
      .eq("id", draftId)
      .maybeSingle();
    expect(forAnon).toBeNull();
  });

  it("published posts are readable by everyone, writable by no one else", async () => {
    const { data: forAnon } = await anonClient()
      .from("posts")
      .select("id, title")
      .eq("id", publishedId)
      .maybeSingle();
    expect(forAnon?.title).toBe("alice published");

    const { data: updated } = await bob.client
      .from("posts")
      .update({ title: "hijacked" })
      .eq("id", publishedId)
      .select("id");
    expect(updated).toEqual([]);

    const { data: deleted } = await bob.client
      .from("posts")
      .delete()
      .eq("id", publishedId)
      .select("id");
    expect(deleted).toEqual([]);
  });
});

describe("post forgery", () => {
  it("cannot create posts owned by someone else", async () => {
    const { error } = await bob.client
      .from("posts")
      .insert({ owner_id: alice.id, title: "forged", body: "" });
    expect(error).not.toBeNull();
  });

  it("cannot self-mark posts as official", async () => {
    const { error } = await bob.client
      .from("posts")
      .insert({ owner_id: bob.id, title: "fake official", is_official: true });
    expect(error).not.toBeNull();
  });

  it("cannot attach someone else's project (trigger, not RLS)", async () => {
    const { error } = await alice.client
      .from("posts")
      .insert({
        owner_id: alice.id,
        title: "steals bob's project",
        project_id: bobsProjectId,
      });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/must belong to the post owner/);
  });

  it("cannot spoof published_at (server-managed column)", async () => {
    const { error } = await alice.client
      .from("posts")
      .update({ published_at: "2999-01-01T00:00:00Z" } as never)
      .eq("id", publishedId);
    expect(error).not.toBeNull();
  });

  it("publish stamps published_at, unpublish clears it", async () => {
    const { data: fresh, error } = await alice.client
      .from("posts")
      .insert({ owner_id: alice.id, title: "stamp me", is_published: true })
      .select("id, published_at")
      .single();
    if (error) throw error;
    expect(fresh.published_at).not.toBeNull();

    const { data: back } = await alice.client
      .from("posts")
      .update({ is_published: false })
      .eq("id", fresh.id)
      .select("published_at")
      .single();
    expect(back?.published_at).toBeNull();

    await alice.client.from("posts").delete().eq("id", fresh.id);
  });
});

describe("likes and comments", () => {
  it("users like published posts; likes on drafts are rejected", async () => {
    const { error: ok } = await bob.client
      .from("post_likes")
      .insert({ post_id: publishedId, user_id: bob.id });
    expect(ok).toBeNull();

    const { error: draftLike } = await alice.client
      .from("post_likes")
      .insert({ post_id: draftId, user_id: alice.id });
    expect(draftLike).not.toBeNull();
  });

  it("cannot like as someone else", async () => {
    const { error } = await bob.client
      .from("post_likes")
      .insert({ post_id: publishedId, user_id: alice.id });
    expect(error).not.toBeNull();
  });

  it("comments work on published posts and are visible to anon", async () => {
    const { data: comment, error } = await bob.client
      .from("post_comments")
      .insert({ post_id: publishedId, user_id: bob.id, body: "nice post" })
      .select("id")
      .single();
    expect(error).toBeNull();

    const { data: forAnon } = await anonClient()
      .from("post_comments")
      .select("body")
      .eq("post_id", publishedId);
    expect(forAnon?.map((c) => c.body)).toContain("nice post");

    // the POST OWNER can delete someone else's comment
    const { data: deleted } = await alice.client
      .from("post_comments")
      .delete()
      .eq("id", comment!.id)
      .select("id");
    expect(deleted?.length).toBe(1);
  });

  it("random users cannot delete others' comments", async () => {
    const { data: comment } = await alice.client
      .from("post_comments")
      .insert({ post_id: publishedId, user_id: alice.id, body: "mine" })
      .select("id")
      .single();

    const { data: deleted } = await bob.client
      .from("post_comments")
      .delete()
      .eq("id", comment!.id)
      .select("id");
    expect(deleted).toEqual([]);
  });

  it("comments on drafts are rejected; anon cannot comment", async () => {
    const { error: onDraft } = await alice.client
      .from("post_comments")
      .insert({ post_id: draftId, user_id: alice.id, body: "sneaky" });
    expect(onDraft).not.toBeNull();

    const { error: asAnon } = await anonClient()
      .from("post_comments")
      .insert({ post_id: publishedId, user_id: bob.id, body: "anon" });
    expect(asAnon).not.toBeNull();
  });
});
