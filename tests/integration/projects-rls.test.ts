/**
 * RLS isolation for projects and project files — projects are strictly
 * private to their owner; files inherit through the parent project.
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
  const email = `prj-${label}-${runTag}@example.com`;
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
let projectId: string;

beforeAll(async () => {
  alice = await createSignedInUser("alice");
  bob = await createSignedInUser("bob");

  const { data, error } = await alice.client
    .from("projects")
    .insert({ owner_id: alice.id, name: "alice project" })
    .select("id")
    .single();
  if (error) throw error;
  projectId = data.id;

  const { error: fileError } = await alice.client
    .from("project_files")
    .insert({ project_id: projectId, path: "main.py", content: "print(1)" });
  if (fileError) throw fileError;
});

afterAll(async () => {
  if (alice) await admin.auth.admin.deleteUser(alice.id);
  if (bob) await admin.auth.admin.deleteUser(bob.id);
});

describe("project isolation", () => {
  it("owners see their projects and files", async () => {
    const { data: project } = await alice.client
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .maybeSingle();
    expect(project?.id).toBe(projectId);

    const { data: files } = await alice.client
      .from("project_files")
      .select("path")
      .eq("project_id", projectId);
    expect(files?.map((f) => f.path)).toEqual(["main.py"]);
  });

  it("projects are invisible to other users and anon", async () => {
    const { data: forBob } = await bob.client
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .maybeSingle();
    expect(forBob).toBeNull();

    const { data: forAnon } = await anonClient()
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .maybeSingle();
    expect(forAnon).toBeNull();
  });

  it("files are invisible to other users", async () => {
    const { data } = await bob.client
      .from("project_files")
      .select("id")
      .eq("project_id", projectId);
    expect(data).toEqual([]);
  });

  it("other users cannot modify a project or its files", async () => {
    const { data: updated } = await bob.client
      .from("projects")
      .update({ name: "hijacked" })
      .eq("id", projectId)
      .select("id");
    expect(updated).toEqual([]);

    const { error: insertError } = await bob.client
      .from("project_files")
      .insert({ project_id: projectId, path: "evil.py", content: "x" });
    expect(insertError).not.toBeNull();

    const { data: deleted } = await bob.client
      .from("projects")
      .delete()
      .eq("id", projectId)
      .select("id");
    expect(deleted).toEqual([]);
  });

  it("users cannot create projects owned by someone else", async () => {
    const { error } = await bob.client
      .from("projects")
      .insert({ owner_id: alice.id, name: "forged" });
    expect(error).not.toBeNull();
  });

  it("anonymous clients cannot create projects", async () => {
    const { error } = await anonClient()
      .from("projects")
      .insert({ owner_id: alice.id, name: "anon project" });
    expect(error).not.toBeNull();
  });

  it("path traversal is rejected by the DB constraint", async () => {
    const { error } = await alice.client
      .from("project_files")
      .insert({ project_id: projectId, path: "../escape.py", content: "" });
    expect(error).not.toBeNull();
  });
});
