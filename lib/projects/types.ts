import { z } from "zod";

/** Mirrors the DB check constraint on project_files.path. */
export const filePathSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(
    /^[A-Za-z0-9_][A-Za-z0-9._/-]*$/,
    "Use letters, digits, dots, dashes and / for folders",
  )
  .refine((p) => !p.includes("..") && !p.includes("//") && !p.endsWith("/"), {
    message: "Invalid path",
  });

export const fileSchema = z.object({
  path: filePathSchema,
  content: z.string().max(100_000),
});

export type ProjectFilePayload = z.infer<typeof fileSchema>;

export const MAX_PROJECT_FILES = 50;
export const MAX_PROJECT_GRAPHS = 10;

export const STARTER_MAIN_PY = `# Press Run to execute the open file against the selected graph.
#
# \`graph\` is available here. Other project files are importable — put a
# function in helpers.py and \`from helpers import bfs\`. Helper modules can
# reach the canvas too, via \`from graph_editor import graph\`.

for node in graph.getNodes():
    graph.setCurrentNode(node)
    print(node)
`;

export const STARTER_HELPERS_PY = `"""Helper module — import me from main.py: \`from helpers import greet\`."""
from graph_editor import graph


def greet():
    print(f"the graph has {len(graph.getNodes())} nodes")
`;

export type FileTreeNode =
  | { kind: "folder"; name: string; path: string; children: FileTreeNode[] }
  | { kind: "file"; name: string; path: string };

/** Fold flat slash-separated paths into a sorted folder tree. */
export function buildFileTree(paths: string[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];

  for (const path of [...paths].sort()) {
    const segments = path.split("/");
    let level = root;
    let prefix = "";
    for (let i = 0; i < segments.length; i++) {
      const name = segments[i];
      prefix = prefix ? `${prefix}/${name}` : name;
      if (i === segments.length - 1) {
        level.push({ kind: "file", name, path });
        break;
      }
      let folder = level.find(
        (n): n is Extract<FileTreeNode, { kind: "folder" }> =>
          n.kind === "folder" && n.path === prefix,
      );
      if (!folder) {
        folder = { kind: "folder", name, path: prefix, children: [] };
        level.push(folder);
      }
      level = folder.children;
    }
  }

  const sortLevel = (nodes: FileTreeNode[]) => {
    nodes.sort((a, b) =>
      a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "folder" ? -1 : 1,
    );
    for (const node of nodes) {
      if (node.kind === "folder") sortLevel(node.children);
    }
  };
  sortLevel(root);
  return root;
}
