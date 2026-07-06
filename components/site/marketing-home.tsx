import Link from "next/link";
import hljs from "highlight.js/lib/core";
import pythonLang from "highlight.js/lib/languages/python";
import { ArrowRight, NotebookPen, Play, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

hljs.registerLanguage("python", pythonLang);

const DEMO_CODE = `visited = set()

def dfs(node):
    if node in visited:
        return
    visited.add(node)
    for neighbour in graph.getNeighbors(node):
        dfs(neighbour)   # the canvas animates as the graph is read

dfs("A")`;

// highlighted once on the server (this is a server component) — the hljs token
// classes are themed in globals.css to match the Monaco editor, so no client
// JS ships for this. hljs escapes the source while tokenizing, so it's safe.
const DEMO_HTML = hljs.highlight(DEMO_CODE, { language: "python" }).value;

const FEATURES = [
  {
    icon: NotebookPen,
    color: "text-(--graph-current)",
    title: "Real Python, in your browser",
    description:
      "CPython compiled to WebAssembly (Pyodide) with networkx preloaded. No server round-trips — your code runs in a Web Worker next to the canvas.",
  },
  {
    icon: Play,
    color: "text-(--graph-visited-border)",
    title: "Watch algorithms think",
    description:
      "Plain textbook code animates the canvas by itself — every graph read becomes a frame, with the executing line highlighted in sync. Play, pause, step and scrub through every decision.",
  },
  {
    icon: Share2,
    color: "text-(--graph-path)",
    title: "Your graphs, saved and private",
    description:
      "Sign in with GitHub or Google. Graphs are stored in Postgres behind row-level security — private by default, shareable when you say so.",
  },
];

/** The signed-out landing page; signed-in visitors get the dashboard. */
export function MarketingHome() {
  return (
    <div className="relative">
      <div className="dot-grid absolute inset-0 -z-10" aria-hidden />
      <div className="mx-auto w-full max-w-5xl px-6 py-16 sm:py-24">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div className="flex flex-col items-start gap-6">
            <p className="text-xs font-semibold tracking-[0.18em] text-brand uppercase">
              Python, visualized
            </p>
            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              Draw a graph. Write Python.{" "}
              <span className="bg-linear-to-r from-(--graph-current) to-(--graph-visited-border) bg-clip-text text-transparent">
                Watch it run.
              </span>
            </h1>
            <p className="text-lg text-muted-foreground">
              An interactive graph editor where real Python drives the canvas —
              write a traversal, press run, and see every step animate in front
              of you.
            </p>
            <div className="flex gap-3">
              <Button size="lg" asChild>
                <Link href="/projects">
                  Open your projects <ArrowRight />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/explore">Explore sample graphs</Link>
              </Button>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border bg-card shadow-lg shadow-foreground/5">
            <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-2.5">
              <span className="text-xs font-medium text-muted-foreground">
                dfs.py
              </span>
              <span className="rounded-full bg-(--graph-path-fill) px-2.5 py-0.5 text-[10px] font-semibold text-stone-900">
                Python
              </span>
            </div>
            <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed text-foreground">
              <code dangerouslySetInnerHTML={{ __html: DEMO_HTML }} />
            </pre>
          </div>
        </div>

        <div className="mt-20 grid gap-4 sm:grid-cols-3">
          {FEATURES.map((feature) => (
            <Card key={feature.title}>
              <CardHeader>
                <feature.icon className={`mb-2 size-5 ${feature.color}`} />
                <CardTitle className="text-base">{feature.title}</CardTitle>
                <CardDescription className="leading-relaxed">
                  {feature.description}
                </CardDescription>
              </CardHeader>
              <CardContent />
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
