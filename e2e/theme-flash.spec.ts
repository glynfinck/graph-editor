import { PNG } from "pngjs";
import { expect, test, type Page } from "@playwright/test";

/**
 * Regression guards for the white / theme "flash" bugs:
 *
 *  1. Light-theme FOUC on a hard refresh in dark mode — fixed by running the
 *     theme-init script in <head> (app/layout.tsx) so `dark` is set before the
 *     first paint. If it drifts back into <body>, the page paints the light
 *     ivory background for a frame first.
 *  2. Directed/undirected toggle rebuilding the whole Pixi WebGL Application —
 *     fixed by updating directedness in place (lib/editor/pixi/base-objects.ts).
 *     A rebuild removes the old <canvas> and briefly blanks it.
 *
 * Capture is via CDP screencast, which coalesces frames — a headless miss is a
 * false negative, so these assert the *fix's mechanism* (script placement, same
 * canvas element) alongside the visual check, which stays reliable.
 *
 * The residual flash that survives all of this is the browser's own
 * cross-document navigation blank (see FLASH_FUZZ below); it is browser-level
 * and not assertable, so it is intentionally not tested here.
 */

// The light theme's --background is a warm ivory (oklch(0.975 0.009 90) ≈
// rgb(247,244,237)). Match that specifically — NOT pure white — so this catches
// the theme FOUC without tripping on a WebGL/nav blank (pure white) or content.
function ivoryFraction(buf: Buffer): number {
  const png = PNG.sync.read(buf);
  let hit = 0;
  let total = 0;
  for (let y = 0; y < png.height; y += 6) {
    for (let x = 0; x < png.width; x += 6) {
      const k = (png.width * y + x) << 2;
      const r = png.data[k];
      const g = png.data[k + 1];
      const b = png.data[k + 2];
      total++;
      const warmLight =
        r >= 235 && r <= 253 && g >= 232 && g <= 251 && b >= 222 && b <= 247;
      if (warmLight && r >= g && g >= b - 2) hit++;
    }
  }
  return total ? hit / total : 0;
}

/** Run `action` while screencasting; return every captured frame as a PNG buffer. */
async function framesDuring(
  page: Page,
  action: () => Promise<void>,
): Promise<Buffer[]> {
  const client = await page.context().newCDPSession(page);
  const frames: Buffer[] = [];
  client.on("Page.screencastFrame", async (f) => {
    frames.push(Buffer.from(f.data, "base64"));
    try {
      await client.send("Page.screencastFrameAck", { sessionId: f.sessionId });
    } catch {
      // screencast stopped mid-ack; ignore
    }
  });
  await client.send("Page.startScreencast", { format: "png", everyNthFrame: 1 });
  await action();
  await client.send("Page.stopScreencast").catch(() => {});
  return frames;
}

test.describe("theme + canvas flashes", () => {
  test("dark mode is set in <head>, before first paint", async ({ page }) => {
    await page.goto("/");
    // the hand-placed init script (app/layout.tsx) must live in <head> so the
    // `dark` class lands before the browser paints the body background
    const inHead = await page.evaluate(() =>
      [...document.head.querySelectorAll("script")].some((s) =>
        (s.textContent ?? "").includes('classList.add("dark")'),
      ),
    );
    expect(inHead, "theme-init script should be in <head>").toBe(true);
  });

  test("hard refresh in dark mode never flashes the light theme", async ({
    page,
  }) => {
    // force dark before any page script runs, on every navigation
    await page.addInitScript(() => localStorage.setItem("theme", "dark"));
    // a non-canvas page keeps the ivory detector clean (no light graph nodes)
    await page.goto("/library");
    await expect(page.locator("html")).toHaveClass(/dark/);

    const frames = await framesDuring(page, async () => {
      for (let i = 0; i < 6; i++) {
        await page.reload({ waitUntil: "commit" });
        await page.waitForTimeout(280);
      }
      await page.waitForTimeout(300);
    });

    const worst = Math.max(0, ...frames.map(ivoryFraction));
    expect(
      worst,
      `saw a light-theme (ivory) frame during refresh: ${(worst * 100) | 0}% ivory`,
    ).toBeLessThan(0.3);
  });

  test("incidental <html> class churn must not rebuild the graph canvas", async ({
    page,
  }) => {
    // The WebGL canvas rebuilds whenever useThemeVersion bumps, and it bumps on
    // ANY class / data-palette write to <html>. next-themes rewrites that class
    // on hydration/settle (same value) and other UI (toasts, scroll-locks) adds
    // transient classes — each one tore down + recreated the canvas, flashing
    // the graph pane. Only a real light/dark or palette change should rebuild.
    await page.addInitScript(() => localStorage.setItem("theme", "dark"));
    await page.goto("/projects/demo");
    const canvas = page.getByTestId("graph-canvas").locator("canvas");
    await expect(canvas).toBeVisible();
    await page.waitForTimeout(1000);
    await canvas.evaluate((el: HTMLCanvasElement) => {
      el.dataset.rebuildProbe = "orig";
    });

    // an unrelated class change — must NOT change light/dark or the palette
    await page.evaluate(() =>
      document.documentElement.classList.add("probe-churn"),
    );
    await page.waitForTimeout(600);

    const survived = await page
      .getByTestId("graph-canvas")
      .locator("canvas")
      .evaluate((el: HTMLCanvasElement) => el.dataset.rebuildProbe === "orig");
    expect(
      survived,
      "an incidental <html> class change tore down and rebuilt the WebGL canvas",
    ).toBe(true);
  });

  test("graph pane has a solid opaque themed backdrop (no gap can flash white)", async ({
    page,
  }) => {
    // The graph-pane flash on load is a real-GPU compositor artifact: during
    // transitions (skeleton -> dynamic-loading -> canvas) the pane momentarily
    // has no painted content and the compositor shows a blank (white) frame.
    // A solid OPAQUE themed backdrop layer masks it. This can't be captured as
    // pixels headlessly (software rendering never shows the transient), so we
    // guard the root-cause condition instead: the backdrop must be opaque and
    // dark. Without the backdrop it's transparent -> this fails.
    await page.addInitScript(() => localStorage.setItem("theme", "dark"));
    await page.goto("/projects/demo");
    const pane = page.getByTestId("graph-pane").first();
    await expect(pane).toBeVisible();
    // resolve the computed background to concrete RGBA via a 1px canvas (handles
    // lab()/oklch()/rgb() alike)
    const bg = await pane.evaluate((el) => {
      const css = getComputedStyle(el).backgroundColor;
      const cv = document.createElement("canvas");
      cv.width = cv.height = 1;
      const ctx = cv.getContext("2d")!;
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return { css, r, g, b, a };
    });
    expect(bg.a, `backdrop must be opaque, got ${bg.css}`).toBeGreaterThan(240);
    expect(
      bg.r < 120 && bg.g < 120 && bg.b < 120,
      `backdrop must be dark in dark mode, got ${bg.css}`,
    ).toBe(true);
  });

  test("graph canvas mounts already painted (added to the DOM after first render)", async ({
    page,
  }) => {
    // The canvas is appended only after app.render() paints its first frame, so
    // it never enters the page as a blank (white) WebGL layer. Guard that this
    // ordering still yields a real, sized, visible canvas (a broken reorder
    // would leave the graph pane empty).
    await page.addInitScript(() => localStorage.setItem("theme", "dark"));
    await page.goto("/projects/demo");
    const canvas = page.getByTestId("graph-canvas").locator("canvas");
    await expect(canvas).toBeVisible();
    const dims = await canvas.evaluate((el: HTMLCanvasElement) => ({
      w: el.width,
      h: el.height,
      opacity: el.style.opacity || "1",
    }));
    expect(dims.w).toBeGreaterThan(0);
    expect(dims.h).toBeGreaterThan(0);
    expect(dims.opacity).toBe("1"); // never left hidden
  });

  test("toggling directed updates in place, keeping the same WebGL canvas", async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem("theme", "dark"));
    await page.goto("/projects/demo");
    await expect(page.getByText(/in demo mode/).first()).toBeVisible();

    const canvas = page.getByTestId("graph-canvas").locator("canvas");
    await expect(canvas).toBeVisible();
    // tag the live canvas; an in-place toggle keeps it, a rebuild replaces it
    await canvas.evaluate((el: HTMLCanvasElement) => {
      el.dataset.persistProbe = "kept";
    });

    const toggle = page.getByRole("button", { name: /graph — click to make/ });
    await toggle.click();
    // label flips (undirected <-> directed) but the control stays
    await expect(
      page.getByRole("button", { name: /graph — click to make/ }),
    ).toBeVisible();

    const persisted = await page
      .getByTestId("graph-canvas")
      .locator("canvas")
      .evaluate((el: HTMLCanvasElement) => el.dataset.persistProbe ?? null);
    expect(
      persisted,
      "the WebGL canvas was torn down and rebuilt on toggle",
    ).toBe("kept");
  });
});

/**
 * Randomized navigation fuzzer that tries to surface flashes by wandering the
 * app at irregular rates with overlapping/interrupted navigations. Off by
 * default (slow, and the residual it can find is the un-fixable browser
 * navigation blank). Run manually to hunt regressions:
 *
 *   FLASH_FUZZ=1 npm run test:e2e -- theme-flash
 *
 * `--disable-features=PaintHolding` (set it in playwright.config launchOptions
 * when hunting) forces the browser to expose the cross-document blank frame it
 * normally hides, which is what makes that residual reproducible at all.
 */
test.describe("flash fuzzer (manual)", () => {
  test.skip(!process.env.FLASH_FUZZ, "set FLASH_FUZZ=1 to run the fuzzer");

  const GRAPHS = [
    "/graphs/00000000-0000-0000-0000-000000000001",
    "/graphs/00000000-0000-0000-0000-000000000003",
    "/graphs/00000000-0000-0000-0000-000000000005",
  ];
  const POOL = ["/", "/library", "/explore", "/posts", "/projects/demo", ...GRAPHS];
  const pick = <T>(a: T[]): T => a[(Math.random() * a.length) | 0];
  const rnd = (a: number, b: number) => a + Math.random() * (b - a);

  test("wander at irregular rates and report any light frame", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.addInitScript(() => localStorage.setItem("theme", "dark"));
    await page.goto("/library");
    await expect(page.locator("html")).toHaveClass(/dark/);

    let worst = 0;
    const frames = await framesDuring(page, async () => {
      const until = Date.now() + 60_000;
      while (Date.now() < until) {
        const mode = Math.random();
        if (mode < 0.4) {
          // interrupted soft-nav race via the navbar links
          const a = pick(["Library", "Explore"]);
          page.getByRole("link", { name: a }).click().catch(() => {});
          await page.waitForTimeout(rnd(10, 70));
          page
            .getByRole("link", { name: pick(["Library", "Explore"]) })
            .click()
            .catch(() => {});
        } else if (mode < 0.7) {
          page.reload({ waitUntil: "commit" }).catch(() => {});
          if (Math.random() < 0.5) {
            await page.waitForTimeout(rnd(15, 80));
            page.reload({ waitUntil: "commit" }).catch(() => {});
          }
        } else {
          await page.goto(pick(POOL), { waitUntil: "commit" }).catch(() => {});
        }
        await page.waitForTimeout(rnd(30, 350));
      }
    });
    // report but don't fail on the browser navigation blank; a warm ivory frame
    // WOULD indicate a real theme regression
    for (const f of frames) {
      const iv = ivoryFraction(f);
      if (iv > worst) worst = iv;
    }
    console.log(
      `fuzzer: ${frames.length} frames, worst ivory (theme) = ${(worst * 100) | 0}%`,
    );
    expect(worst, "theme FOUC surfaced during fuzzing").toBeLessThan(0.3);
  });
});
