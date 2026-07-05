"use client";

import { useMemo, type ComponentProps } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";

import { GraphEmbedCard } from "@/components/posts/graph-embed-card";
import { ProjectEmbedCard } from "@/components/posts/project-embed-card";
import {
  EMPTY_EMBEDS,
  matchEmbedHref,
  type EmbedMap,
} from "@/lib/posts/embeds";

/**
 * Sanitized GitHub-flavored markdown, styled entirely with design tokens so
 * a post reads correctly in every palette and in dark mode. Raw HTML is
 * skipped (never rendered) — bodies are user-authored.
 *
 * Embeds: a paragraph that is nothing but a link to a graph or project the
 * reader can see renders as a rich card; anything else stays a plain link.
 */

const staticComponents: Components = {
  h1: (props) => (
    <h2
      className="mt-8 font-heading text-xl font-semibold tracking-tight first:mt-0"
      {...props}
    />
  ),
  h2: (props) => (
    <h3
      className="mt-8 font-heading text-lg font-semibold tracking-tight first:mt-0"
      {...props}
    />
  ),
  h3: (props) => (
    <h4
      className="mt-6 font-heading text-base font-semibold tracking-tight"
      {...props}
    />
  ),
  a: (props) => (
    <a
      className="text-brand underline underline-offset-4 hover:opacity-80"
      target={props.href?.startsWith("/") ? undefined : "_blank"}
      rel="noreferrer"
      {...props}
    />
  ),
  ul: (props) => (
    <ul
      className="mt-3 list-disc space-y-1 pl-6 text-sm leading-relaxed"
      {...props}
    />
  ),
  ol: (props) => (
    <ol
      className="mt-3 list-decimal space-y-1 pl-6 text-sm leading-relaxed"
      {...props}
    />
  ),
  blockquote: (props) => (
    <blockquote
      className="mt-3 border-l-2 border-brand pl-4 text-sm text-muted-foreground italic"
      {...props}
    />
  ),
  pre: (props) => (
    <pre
      className="mt-4 overflow-x-auto rounded-lg border bg-muted/50 p-4 font-mono text-[13px] leading-relaxed [&_code]:rounded-none [&_code]:bg-transparent [&_code]:p-0"
      {...props}
    />
  ),
  code: (props) => (
    <code
      className="rounded bg-muted px-1 py-0.5 font-mono text-[13px]"
      {...props}
    />
  ),
  hr: (props) => <hr className="my-8 border-border" {...props} />,
  table: (props) => (
    <div className="mt-4 overflow-x-auto rounded-lg border">
      <table className="w-full text-sm" {...props} />
    </div>
  ),
  thead: (props) => <thead className="bg-muted/50" {...props} />,
  th: (props) => (
    <th className="border-b px-3 py-2 text-left font-medium" {...props} />
  ),
  td: (props) => <td className="border-b px-3 py-2 last:border-b-0" {...props} />,
  img: (props) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="mt-4 max-w-full rounded-lg border"
      alt={props.alt ?? ""}
      {...props}
    />
  ),
};

export function PostBody({
  body,
  postId = "",
  embeds = EMPTY_EMBEDS,
  ownProjects = [],
  signedIn = false,
  attachedProjectId = null,
  ...rest
}: {
  body: string;
  postId?: string;
  embeds?: EmbedMap;
  ownProjects?: { id: string; name: string }[];
  signedIn?: boolean;
  attachedProjectId?: string | null;
} & ComponentProps<"div">) {
  const components = useMemo<Components>(
    () => ({
      ...staticComponents,
      p: ({ node, children, ...props }) => {
        // a paragraph that is exactly one link → maybe an embed card
        const kids = (node?.children ?? []).filter(
          (child) => !(child.type === "text" && !child.value.trim()),
        );
        const only = kids.length === 1 ? kids[0] : null;
        if (only && only.type === "element" && only.tagName === "a") {
          const ref = matchEmbedHref(
            typeof only.properties?.href === "string"
              ? only.properties.href
              : undefined,
          );
          if (ref?.kind === "graph" && embeds.graphs[ref.id]) {
            return (
              <GraphEmbedCard
                embed={embeds.graphs[ref.id]}
                signedIn={signedIn}
                ownProjects={ownProjects}
              />
            );
          }
          if (ref?.kind === "project" && embeds.projects[ref.id]) {
            return (
              <ProjectEmbedCard
                embed={embeds.projects[ref.id]}
                postId={postId}
                canFork={!!attachedProjectId && ref.id === attachedProjectId}
                signedIn={signedIn}
              />
            );
          }
        }
        return (
          <p className="mt-3 text-sm leading-relaxed first:mt-0" {...props}>
            {children}
          </p>
        );
      },
    }),
    [embeds, ownProjects, signedIn, postId, attachedProjectId],
  );

  return (
    <div {...rest}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        // token colors live in globals.css and mirror the Monaco theme
        rehypePlugins={[rehypeHighlight]}
        components={components}
        skipHtml
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}
