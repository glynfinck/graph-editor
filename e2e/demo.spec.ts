import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Signed-out demo workspace, driven end to end in a real browser — the only
 * place the Pixi (WebGL) canvas, the inspectors, and the Pyodide worker
 * actually run, so these cover ground the Vitest unit/integration suites can't.
 *
 * Precondition: a seeded local Supabase (the demo reads the official lessons
 * from the DB). The Playwright webServer + CI job bring that up; without the
 * seed the demo degrades to a blank fallback and these fail fast.
 */
test.describe("demo workspace", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/projects/demo");
    // the demo banner is the positive signal we loaded signed-out (a signed-in
    // visitor is redirected to /projects). Regex dodges the curly apostrophe.
    await expect(page.getByText(/in demo mode/)).toBeVisible();
  });

  test("loads the seeded lessons signed out", async ({ page }) => {
    // friendly default: bfs.py open against the "A binary tree" graph
    await expect(page.getByRole("button", { name: "bfs.py" })).toBeVisible();
    await expect(page.getByText("A binary tree").first()).toBeVisible();
    // the Pixi canvas mounts (client-only) and reports the seeded element count
    await expect(graphCanvas(page)).toBeVisible();
    await expect(page.getByText(/\d+ nodes \/ \d+ edges/)).toBeVisible();
  });

  test("boots Pyodide and runs the open lesson", async ({ page }) => {
    const run = page.getByRole("button", { name: "Run" });
    // Pyodide + networkx download from a CDN on first paint — give it room
    await expect(run).toBeEnabled({ timeout: 120_000 });
    await run.click();
    // a finished run appends an info line and leaves playback scrubbable
    await expect(page.getByText(/Finished/)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
  });

  test("adds a node and sets a typed attribute in the inspector", async ({
    page,
  }) => {
    await addNodeAndSelect(page);
    await addNodeAttribute(page, {
      name: "capacity",
      type: "number",
      value: "10",
    });
    await expect(page.getByLabel("Attribute name")).toHaveValue("capacity");
    await expect(page.getByLabel("Attribute value")).toHaveValue("10");
  });

  test("reads a node attribute from a Python script (end to end)", async ({
    page,
  }) => {
    const run = page.getByRole("button", { name: "Run" });
    // boot Pyodide while we set the graph up
    await expect(run).toBeEnabled({ timeout: 120_000 });

    const name = await addNodeAndSelect(page);
    await addNodeAttribute(page, {
      name: "capacity",
      type: "number",
      value: "42",
    });

    // a script that reads the attribute we just set back off the node
    const code = `print("cap=", graph.getAttr(${JSON.stringify(name)}, "capacity"))`;
    await setEditorContent(page, code);

    await run.click();
    await expect(page.getByText(/cap= 42/)).toBeVisible({ timeout: 60_000 });
  });
});

// ---------------------------------------------------------------------------

function graphCanvas(page: Page): Locator {
  // the Pixi canvas (Monaco's minimap is also a <canvas>, so scope by testid)
  return page.getByTestId("graph-canvas").locator("canvas");
}

async function nodeCount(page: Page): Promise<number> {
  const text = (await page.getByText(/\d+ nodes \/ \d+ edges/).textContent()) ?? "";
  return Number(text.match(/(\d+) nodes/)?.[1] ?? 0);
}

/**
 * Add a node on empty canvas and select it (double-click adds but does NOT
 * select). Zoom out first so the seeded graph shrinks to the centre and the
 * click spot is reliably empty. Returns the node's auto-assigned name.
 */
async function addNodeAndSelect(page: Page): Promise<string> {
  const canvas = graphCanvas(page);
  await expect(canvas).toBeVisible();

  const zoomOut = page.getByRole("button", { name: "Zoom out" });
  for (let i = 0; i < 3; i++) await zoomOut.click();

  const before = await nodeCount(page);
  // left-of-centre, clear of the top-centre playback bar, top-right inspector,
  // and bottom-right zoom controls
  const spot = { x: 90, y: 200 };
  await canvas.dblclick({ position: spot });
  await expect(page.getByText(/\d+ nodes \/ \d+ edges/)).toHaveText(
    new RegExp(`\\b${before + 1} nodes\\b`),
  );
  await canvas.click({ position: spot });

  await expect(page.getByText("Node", { exact: true })).toBeVisible();
  return page.locator("#node-name").inputValue();
}

/** Add one attribute via the inspector. Set type+value while the key is the
 *  placeholder (stable), then rename last — a rename remounts the row, so this
 *  ordering never races the remount. */
async function addNodeAttribute(
  page: Page,
  attr: { name: string; type: "text" | "number"; value: string },
): Promise<void> {
  await page.getByRole("button", { name: "Add" }).click();
  if (attr.type !== "text") {
    await page.getByLabel("Attribute type").click();
    await page.getByRole("option", { name: attr.type }).click();
  }
  await page.getByLabel("Attribute value").fill(attr.value);
  const key = page.getByLabel("Attribute name");
  await key.fill(attr.name);
  await key.press("Enter");
}

/** Replace the open Monaco file's contents. Setting the value through Monaco's
 *  own API fires the change event the runner listens to (and avoids the
 *  select-all/auto-close pitfalls of char-by-char typing). */
async function setEditorContent(page: Page, code: string): Promise<void> {
  const editor = page.locator(".monaco-editor").first();
  await expect(editor).toBeVisible();
  const viaApi = await page.evaluate((value) => {
    const monaco = (window as unknown as { monaco?: typeof import("monaco-editor") })
      .monaco;
    const editors = monaco?.editor?.getEditors?.() ?? [];
    if (!editors.length) return false;
    editors[0].setValue(value);
    return true;
  }, code);
  if (!viaApi) {
    // fallback: focus Monaco's textarea, select all, and insert
    const textarea = page.locator(".monaco-editor textarea").first();
    await textarea.click();
    await textarea.press("ControlOrMeta+A");
    await page.keyboard.insertText(code);
  }
  await expect(editor).toContainText("getAttr");
}
