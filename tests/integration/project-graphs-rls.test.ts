/**
 * RLS for the posts-platform project changes: public projects are readable
 * by everyone (files and pins follow), and pins are owner-writable, only
 * pointing at graphs the owner can see.
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
const SAMPLE_GRAPH_ID = "00000000-0000-0000-0000-000000000001";

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function anonClient(): SupabaseClient<Database> {
  return createClient<Database>(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function createSignedInUser(label: string) {
  const email = `pg-${label}-${runTag}@example.com`;
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
let publicProjectId: string;
let privateProjectId: string;
let bobsPrivateGraphId: string;

beforeAll(async () => {
  alice = await createSignedInUser("alice");
  bob = await createSignedInUser("bob");

  const { data: pub, error: pubError } = await alice.client
    .from("projects")
    .insert({ owner_id: alice.id, name: "alice public project" })
    .select("id")
    .single();
  if (pubError) throw pubError;
  publicProjectId = pub.id;

  const { data: priv, error: privError } = await alice.client
    .from("projects")
    .insert({ owner_id: alice.id, name: "alice private project" })
    .select("id")
    .single();
  if (privError) throw privError;
  privateProjectId = priv.id;

  const { error: fileError } = await alice.client
    .from("project_files")
    .insert({
      project_id: publicProjectId,
      path: "main.py",
      content: "print(1)",
    });
  if (fileError) throw fileError;

  const { error: pinError } = await alice.client
    .from("project_graphs")
    .insert({ project_id: publicProjectId, graph_id: SAMPLE_GRAPH_ID });
  if (pinError) throw pinError;
  const { error: pin2Error } = await alice.client
    .from("project_graphs")
    .insert({ project_id: privateProjectId, graph_id: SAMPLE_GRAPH_ID });
  if (pin2Error) throw pin2Error;

  const { error: publishError } = await alice.client
    .from("projects")
    .update({ is_public: true })
    .eq("id", publicProjectId);
  if (publishError) throw publishError;

  const { data: bobGraph, error: bobGraphError } = await bob.client
    .from("graphs")
    .insert({ owner_id: bob.id, name: "bob private graph" })
    .select("id")
    .single();
  if (bobGraphError) throw bobGraphError;
  bobsPrivateGraphId = bobGraph.id;
});

afterAll(async () => {
  if (alice) await admin.auth.admin.deleteUser(alice.id);
  if (bob) await admin.auth.admin.deleteUser(bob.id);
});

describe("public projects", () => {
  it("are readable by other users and anon, files and pins included", async () => {
    const { data: forBob } = await bob.client
      .from("projects")
      .select("id, name")
      .eq("id", publicProjectId)
      .maybeSingle();
    expect(forBob?.id).toBe(publicProjectId);

    const anon = anonClient();
    const { data: forAnon } = await anon
      .from("projects")
      .select("id")
      .eq("id", publicProjectId)
      .maybeSingle();
    expect(forAnon?.id).toBe(publicProjectId);

    const { data: files } = await anon
      .from("project_files")
      .select("path")
      .eq("project_id", publicProjectId);
    expect(files?.map((f) => f.path)).toEqual(["main.py"]);

    const { data: pins } = await anon
      .from("project_graphs")
      .select("graph_id")
      .eq("project_id", publicProjectId);
    expect(pins?.map((p) => p.graph_id)).toEqual([SAMPLE_GRAPH_ID]);
  });

  it("stay writable only by their owner", async () => {
    const { data: updated } = await bob.client
      .from("projects")
      .update({ name: "hijacked" })
      .eq("id", publicProjectId)
      .select("id");
    expect(updated).toEqual([]);

    const { error: fileInsert } = await bob.client
      .from("project_files")
      .insert({ project_id: publicProjectId, path: "evil.py", content: "x" });
    expect(fileInsert).not.toBeNull();
  });

  it("private projects and their pins stay invisible", async () => {
    const { data: project } = await bob.client
      .from("projects")
      .select("id")
      .eq("id", privateProjectId)
      .maybeSingle();
    expect(project).toBeNull();

    const { data: pins } = await anonClient()
      .from("project_graphs")
      .select("graph_id")
      .eq("project_id", privateProjectId);
    expect(pins).toEqual([]);
  });
});

describe("pin writes", () => {
  it("other users cannot pin into someone's project", async () => {
    const { error } = await bob.client
      .from("project_graphs")
      .insert({ project_id: publicProjectId, graph_id: SAMPLE_GRAPH_ID });
    expect(error).not.toBeNull();
  });

  it("owners cannot pin graphs they cannot see", async () => {
    const { error } = await alice.client
      .from("project_graphs")
      .insert({ project_id: privateProjectId, graph_id: bobsPrivateGraphId });
    expect(error).not.toBeNull();
  });

  it("other users cannot unpin or reorder someone's pins", async () => {
    const { data: deleted } = await bob.client
      .from("project_graphs")
      .delete()
      .eq("project_id", publicProjectId)
      .select("graph_id");
    expect(deleted).toEqual([]);

    const { data: reordered } = await bob.client
      .from("project_graphs")
      .update({ position: 5 })
      .eq("project_id", publicProjectId)
      .select("graph_id");
    expect(reordered).toEqual([]);
  });

  it("anon cannot pin", async () => {
    const { error } = await anonClient()
      .from("project_graphs")
      .insert({ project_id: publicProjectId, graph_id: SAMPLE_GRAPH_ID });
    expect(error).not.toBeNull();
  });
});
