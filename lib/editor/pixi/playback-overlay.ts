/**
 * The playback decoration overlay, shared by both Pixi bases. The base graph is
 * drawn once; this overlay sits on top and paints only the visited/path/current
 * elements as the playhead moves — appending each promotion once on forward
 * playback (O(1) per event) rather than repainting the whole graph every tick.
 * Mirrors the React Flow GraphDecorator's incremental design.
 */
import { Container, Graphics, type Ticker } from "pixi.js";

import {
  computeVisualState,
  edgeKey,
  emptyVisualState,
  type Frame,
  type VisualState,
} from "@/lib/editor/frames";
import type { GraphPalette } from "@/lib/editor/pixi/colors";
import { arrowheadPoly, R, trimmedEnds, type Pt } from "@/lib/editor/pixi/geometry";

// marching-ants dashes on the current edge (React Flow animates its active edge
// the same way); world units so they scale with zoom, DASH_SPEED in units/sec.
const DASH_LEN = 7;
const DASH_GAP = 5;
const DASH_SPEED = 26;

const NODE_CHUNK = 150;
const EDGE_CHUNK = 600;

export type PlaybackOverlay = {
  decorate: (frames: Frame[], playhead: number) => void;
  /** repaint every decoration at current node/edge positions — call after a
   * drag or structural edit moves/removes a decorated element, since the
   * append-only painters bake absolute coordinates at promotion time */
  refresh: () => void;
  destroy: () => void;
};

/** append-only chunked painter: each promotion draws once and stays, so
 * forward playback never repaints the whole overlay */
function painter(parent: Container, chunk: number) {
  let g: Graphics | null = null;
  let n = 0;
  const list: Graphics[] = [];
  return {
    add(draw: (g: Graphics) => void) {
      if (n % chunk === 0) {
        g = new Graphics();
        parent.addChild(g);
        list.push(g);
      }
      n++;
      draw(g!);
    },
    reset() {
      for (const gg of list) {
        parent.removeChild(gg);
        gg.destroy();
      }
      list.length = 0;
      g = null;
      n = 0;
    },
  };
}

export function createPlaybackOverlay(opts: {
  world: Container;
  ticker: Ticker;
  palette: GraphPalette;
  directed: boolean;
  /** resolve a node id to its center position (live) */
  nodePos: (id: string) => Pt | undefined;
  /** resolve a frame edge key to its endpoint positions (live) */
  edgeRec: (key: string) => { s: Pt; t: Pt } | undefined;
}): PlaybackOverlay {
  const { world, ticker, palette: c, directed, nodePos, edgeRec } = opts;

  // Fixed sub-layers keep the z-order stable (edges under nodes, cursor on top)
  // regardless of promotion order during a run.
  const overlay = new Container();
  const layVisitedEdges = new Container();
  const layPathEdges = new Container();
  const layVisitedNodes = new Container();
  const layPathNodes = new Container();
  const layCurrent = new Graphics();
  overlay.addChild(
    layVisitedEdges,
    layPathEdges,
    layVisitedNodes,
    layPathNodes,
    layCurrent,
  );
  world.addChild(overlay);

  const pVisitedNodes = painter(layVisitedNodes, NODE_CHUNK);
  const pPathNodes = painter(layPathNodes, NODE_CHUNK);
  const pVisitedEdges = painter(layVisitedEdges, EDGE_CHUNK);
  const pPathEdges = painter(layPathEdges, EDGE_CHUNK);

  const drawNode = (
    p: ReturnType<typeof painter>,
    id: string,
    fill: number,
    border: number,
  ) => {
    const pos = nodePos(id);
    if (!pos) return;
    p.add((g) =>
      g.circle(pos.x, pos.y, R).fill(fill).stroke({ width: 2, color: border }),
    );
  };
  const drawEdge = (
    p: ReturnType<typeof painter>,
    rec: { s: Pt; t: Pt },
    width: number,
    color: number,
  ) => {
    const e = trimmedEnds(rec.s, rec.t, directed);
    p.add((g) =>
      g.moveTo(e.x1, e.y1).lineTo(e.x2, e.y2).stroke({ width, color }),
    );
  };

  // the moving cursor — one node + one edge, cleared and redrawn each tick. The
  // edge is animated marching-ants dashes matching React Flow's active edge.
  let dashPhase = 0;
  const drawCurrent = (vs: VisualState) => {
    layCurrent.clear();
    if (vs.currentEdge) {
      const rec = edgeRec(vs.currentEdge);
      if (rec) {
        const e = trimmedEnds(rec.s, rec.t, directed);
        const dx = e.x2 - e.x1;
        const dy = e.y2 - e.y1;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const period = DASH_LEN + DASH_GAP;
        const start = (((dashPhase % period) + period) % period) - period;
        for (let p = start; p < len; p += period) {
          const a = Math.max(0, p);
          const b = Math.min(len, p + DASH_LEN);
          if (b > a) {
            layCurrent
              .moveTo(e.x1 + ux * a, e.y1 + uy * a)
              .lineTo(e.x1 + ux * b, e.y1 + uy * b);
          }
        }
        layCurrent.stroke({ width: 3, color: c.current });
        if (directed) {
          layCurrent.poly(arrowheadPoly(rec.s, rec.t)).fill(c.current);
        }
      }
    }
    if (vs.currentNode) {
      const pos = nodePos(vs.currentNode);
      if (pos) {
        layCurrent
          .circle(pos.x, pos.y, R + 4)
          .stroke({ width: 4, color: c.current, alpha: 0.3 })
          .circle(pos.x, pos.y, R)
          .stroke({ width: 3, color: c.current });
      }
    }
  };

  const repaintAll = (vs: VisualState) => {
    pVisitedNodes.reset();
    pPathNodes.reset();
    pVisitedEdges.reset();
    pPathEdges.reset();
    for (const [id, st] of vs.nodeStates) {
      if (st === "path") drawNode(pPathNodes, id, c.pathFill, c.pathBorder);
      else if (st === "visited")
        drawNode(pVisitedNodes, id, c.visitedFill, c.visitedBorder);
    }
    for (const [key, st] of vs.edgeStates) {
      const rec = edgeRec(key);
      if (!rec) continue;
      if (st === "path") drawEdge(pPathEdges, rec, 3, c.pathBorder);
      else if (st === "visited")
        drawEdge(pVisitedEdges, rec, 2, c.visitedBorder);
    }
    drawCurrent(vs);
  };

  // incremental forward fold — mirrors promote() in frames.ts, but emits a draw
  // the moment an element changes state so nothing is repainted twice
  const foldForward = (
    vs: VisualState,
    list: Frame[],
    from: number,
    to: number,
  ) => {
    const end = Math.min(to, list.length);
    for (let i = Math.max(0, from); i < end; i++) {
      const f = list[i];
      if (f.kind === "node") {
        vs.currentNode = f.id;
        const prev = vs.nodeStates.get(f.id);
        if (f.path) {
          if (prev !== "path") {
            vs.nodeStates.set(f.id, "path");
            drawNode(pPathNodes, f.id, c.pathFill, c.pathBorder);
          }
        } else if (!f.peek && prev !== "path" && prev !== "visited") {
          vs.nodeStates.set(f.id, "visited");
          drawNode(pVisitedNodes, f.id, c.visitedFill, c.visitedBorder);
        }
      } else if (f.kind === "edge") {
        const key = edgeKey(f.source, f.target, directed);
        vs.currentEdge = key;
        const prev = vs.edgeStates.get(key);
        const rec = edgeRec(key);
        if (f.path) {
          if (prev !== "path") {
            vs.edgeStates.set(key, "path");
            if (rec) drawEdge(pPathEdges, rec, 3, c.pathBorder);
          }
        } else if (!f.peek && prev !== "path" && prev !== "visited") {
          vs.edgeStates.set(key, "visited");
          if (rec) drawEdge(pVisitedEdges, rec, 2, c.visitedBorder);
        }
      } else if (f.kind === "clear") {
        vs.currentNode = null;
        vs.currentEdge = null;
      }
    }
  };

  let vs: VisualState = emptyVisualState();
  let foldedFrames: Frame[] | null = null;
  let foldedCount = 0;
  const decorate = (nextFrames: Frame[], nextPlayhead: number) => {
    if (nextFrames !== foldedFrames || nextPlayhead < foldedCount) {
      // new run or backward scrub → fold from scratch and repaint
      vs = computeVisualState(nextFrames, nextPlayhead, directed);
      foldedFrames = nextFrames;
      foldedCount = nextPlayhead;
      repaintAll(vs);
    } else if (nextPlayhead > foldedCount) {
      foldForward(vs, nextFrames, foldedCount, nextPlayhead);
      foldedFrames = nextFrames;
      foldedCount = nextPlayhead;
      drawCurrent(vs);
    }
  };

  // march the dashes: redraw only the tiny cursor layer each frame while an
  // edge is active (Pixi renders the stage continuously anyway)
  const animateDashes = () => {
    if (!vs.currentEdge) return;
    dashPhase += (ticker.deltaMS / 1000) * DASH_SPEED;
    drawCurrent(vs);
  };
  ticker.add(animateDashes);

  return {
    decorate,
    // re-fold nothing, just repaint the current state at live positions
    // (drawNode/drawEdge read nodePos/edgeRec fresh, and a removed element's
    // lookup returns undefined so its ghost drops out)
    refresh: () => repaintAll(vs),
    destroy: () => {
      ticker.remove(animateDashes);
      overlay.destroy({ children: true });
    },
  };
}
