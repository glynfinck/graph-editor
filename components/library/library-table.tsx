"use client";

import Link from "next/link";
import { FolderCode, Newspaper, Waypoints } from "lucide-react";

import { GraphCardActions } from "@/components/graphs/graph-card-actions";
import { PostCardActions } from "@/components/posts/post-card-actions";
import { ProjectCardActions } from "@/components/projects/project-card-actions";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatRelativeTime } from "@/lib/format";

/** One library entry flattened for the management table. */
export type LibraryRow = {
  type: "project" | "graph" | "post";
  id: string;
  name: string;
  href: string;
  status: "Private" | "Public" | "Draft" | "Published";
  /** per-type facts, e.g. "12 nodes · 8 edges" */
  meta: string;
  likeCount: number | null;
  updatedAt: string;
  /** not rendered — lets the page sort a mixed list by creation date */
  createdAt: string;
  /** graphs: drives the visibility toggle + tag editor in the menu */
  isPublic?: boolean;
  tags?: string[];
  /** posts: drives publish/unpublish in the menu */
  isPublished?: boolean;
};

const TYPE_META = {
  project: { label: "Project", Icon: FolderCode },
  graph: { label: "Graph", Icon: Waypoints },
  post: { label: "Post", Icon: Newspaper },
} as const;

function RowActions({ row }: { row: LibraryRow }) {
  switch (row.type) {
    case "project":
      return <ProjectCardActions projectId={row.id} projectName={row.name} />;
    case "graph":
      return (
        <GraphCardActions
          graphId={row.id}
          graphName={row.name}
          canDelete
          signedIn
          isPublic={row.isPublic}
          tags={row.tags}
        />
      );
    case "post":
      return (
        <PostCardActions postId={row.id} isPublished={!!row.isPublished} />
      );
  }
}

/** Dense management view of the library — same actions as the cards. */
export function LibraryTable({ rows }: { rows: LibraryRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden md:table-cell">Details</TableHead>
            <TableHead className="text-right">Likes</TableHead>
            <TableHead className="text-right">Updated</TableHead>
            <TableHead className="w-10" aria-label="Actions" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const { label, Icon } = TYPE_META[row.type];
            return (
              <TableRow key={`${row.type}-${row.id}`}>
                <TableCell className="max-w-64 font-medium">
                  <Link
                    href={row.href}
                    className="flex items-center gap-2 hover:underline"
                  >
                    <Icon className="size-3.5 shrink-0 text-brand" />
                    <span className="truncate">{row.name}</span>
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {label}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      row.status === "Public" || row.status === "Published"
                        ? "secondary"
                        : "outline"
                    }
                  >
                    {row.status}
                  </Badge>
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {row.meta}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {row.likeCount ?? "—"}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap text-muted-foreground">
                  {formatRelativeTime(row.updatedAt)}
                </TableCell>
                <TableCell className="py-1 text-right">
                  <RowActions row={row} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
