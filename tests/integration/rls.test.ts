/**
 * RLS isolation matrix — runs against a real local Supabase
 * (`supabase start && supabase db reset`), with credentials in .env.local.
 *
 * The contract under test: a user's graphs are invisible and immutable to
 * everyone else; samples are readable by all and writable by no one.
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
  const email = `rls-${label}-${runTag}@example.com`;
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
let privateGraphId: string;

beforeAll(async () => {
  alice = await createSignedInUser("alice");
  bob = await createSignedInUser("bob");

  const { data, error } = await alice.client
    .from("graphs")
    .insert({ owner_id: alice.id, name: "alice private graph" })
    .select("id")
    .single();
  if (error) throw error;
  privateGraphId = data.id;
});

afterAll(async () => {
  // deleting the users cascades to their graphs and profiles
  if (alice) await admin.auth.admin.deleteUser(alice.id);
  if (bob) await admin.auth.admin.deleteUser(bob.id);
});

describe("graph isolation between users", () => {
  it("owners see their own private graphs", async () => {
    const { data } = await alice.client
      .from("graphs")
      .select("id")
      .eq("id", privateGraphId)
      .maybeSingle();
    expect(data?.id).toBe(privateGraphId);
  });

  it("other users cannot see a private graph", async () => {
    const { data } = await bob.client
      .from("graphs")
      .select("id")
      .eq("id", privateGraphId)
      .maybeSingle();
    expect(data).toBeNull();
  });

  it("anonymous clients cannot see a private graph", async () => {
    const { data } = await anonClient()
      .from("graphs")
      .select("id")
      .eq("id", privateGraphId)
      .maybeSingle();
    expect(data).toBeNull();
  });

  it("other users cannot update a private graph", async () => {
    const { data } = await bob.client
      .from("graphs")
      .update({ name: "hijacked" })
      .eq("id", privateGraphId)
      .select("id");
    expect(data).toEqual([]);
  });

  it("other users cannot delete a private graph", async () => {
    const { data } = await bob.client
      .from("graphs")
      .delete()
      .eq("id", privateGraphId)
      .select("id");
    expect(data).toEqual([]);

    const { data: stillThere } = await alice.client
      .from("graphs")
      .select("id")
      .eq("id", privateGraphId)
      .maybeSingle();
    expect(stillThere?.id).toBe(privateGraphId);
  });

  it("users cannot insert graphs owned by someone else", async () => {
    const { error } = await bob.client
      .from("graphs")
      .insert({ owner_id: alice.id, name: "forged ownership" });
    expect(error).not.toBeNull();
  });

  it("public graphs become visible to others, but stay immutable", async () => {
    const { error: publishError } = await alice.client
      .from("graphs")
      .update({ is_public: true })
      .eq("id", privateGraphId);
    expect(publishError).toBeNull();

    const { data } = await bob.client
      .from("graphs")
      .select("id")
      .eq("id", privateGraphId)
      .maybeSingle();
    expect(data?.id).toBe(privateGraphId);

    const { data: updated } = await bob.client
      .from("graphs")
      .update({ name: "still not yours" })
      .eq("id", privateGraphId)
      .select("id");
    expect(updated).toEqual([]);
  });
});

describe("sample graphs", () => {
  it("are readable anonymously", async () => {
    const { data, error } = await anonClient()
      .from("graphs")
      .select("id, is_sample")
      .eq("is_sample", true);
    expect(error).toBeNull();
    expect(data?.length).toBeGreaterThan(0);
  });

  it("cannot be modified by signed-in users", async () => {
    const { data: samples } = await bob.client
      .from("graphs")
      .select("id")
      .eq("is_sample", true)
      .limit(1);
    const sampleId = samples?.[0]?.id;
    expect(sampleId).toBeTruthy();

    const { data } = await bob.client
      .from("graphs")
      .update({ name: "defaced sample" })
      .eq("id", sampleId!)
      .select("id");
    expect(data).toEqual([]);
  });

  it("cannot be created by users (is_sample is not grantable)", async () => {
    const { error } = await bob.client
      .from("graphs")
      .insert({ owner_id: bob.id, name: "fake sample", is_sample: true });
    expect(error).not.toBeNull();
  });
});

describe("anonymous writes", () => {
  it("are rejected", async () => {
    const { error } = await anonClient()
      .from("graphs")
      .insert({ name: "anon graph" });
    expect(error).not.toBeNull();
  });
});
