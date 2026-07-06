/**
 * Node/edge attribute persistence — runs against a real local Supabase
 * (`supabase start && supabase db reset`), with credentials in .env.local.
 *
 * The contract under test: replace_graph_doc round-trips a jsonb attribute bag
 * on both nodes and edges, preserving scalar types, and defaults an element
 * with no `attributes` key to an empty object.
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
  const email = `attrs-${label}-${runTag}@example.com`;
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
let graphId: string;
const A = crypto.randomUUID();
const B = crypto.randomUUID();
const E = crypto.randomUUID();

beforeAll(async () => {
  alice = await createSignedInUser("alice");

  const { data, error } = await alice.client
    .from("graphs")
    .insert({ owner_id: alice.id, name: "attributes graph" })
    .select("id")
    .single();
  if (error) throw error;
  graphId = data.id;

  // A carries a full scalar bag; B omits attributes entirely (tests the
  // coalesce default). The edge carries its own bag.
  const { error: rpcError } = await alice.client.rpc("replace_graph_doc", {
    p_graph_id: graphId,
    p_nodes: [
      { id: A, name: "A", x: 0, y: 0, attributes: { capacity: 10, color: "red", active: true } },
      { id: B, name: "B", x: 100, y: 0 },
    ],
    p_edges: [
      { id: E, source: A, target: B, weight: null, attributes: { cost: 2.5, oneway: false } },
    ],
  });
  if (rpcError) throw rpcError;
});

afterAll(async () => {
  if (alice) await admin.auth.admin.deleteUser(alice.id); // cascades to the graph
});

describe("replace_graph_doc attribute round-trip", () => {
  it("persists a node's attributes with their scalar types", async () => {
    const { data, error } = await alice.client
      .from("graph_nodes")
      .select("attributes")
      .eq("graph_id", graphId)
      .eq("id", A)
      .single();
    expect(error).toBeNull();
    expect(data?.attributes).toEqual({ capacity: 10, color: "red", active: true });
  });

  it("defaults a node with no attributes key to an empty object", async () => {
    const { data } = await alice.client
      .from("graph_nodes")
      .select("attributes")
      .eq("graph_id", graphId)
      .eq("id", B)
      .single();
    expect(data?.attributes).toEqual({});
  });

  it("persists an edge's attributes", async () => {
    const { data } = await alice.client
      .from("graph_edges")
      .select("attributes")
      .eq("graph_id", graphId)
      .eq("id", E)
      .single();
    expect(data?.attributes).toEqual({ cost: 2.5, oneway: false });
  });

  it("swaps attributes atomically on the next replace", async () => {
    const { error } = await alice.client.rpc("replace_graph_doc", {
      p_graph_id: graphId,
      p_nodes: [{ id: A, name: "A", x: 0, y: 0, attributes: { capacity: 99 } }],
      p_edges: [],
    });
    expect(error).toBeNull();

    const { data } = await alice.client
      .from("graph_nodes")
      .select("attributes")
      .eq("graph_id", graphId)
      .eq("id", A)
      .single();
    // the whole doc was replaced: A's bag is the new one, B and the edge are gone
    expect(data?.attributes).toEqual({ capacity: 99 });
  });
});
