import type { ConsoleLine } from "@/lib/editor/store";

/**
 * A tiny unix-flavoured shell over a project's in-memory file tree
 * (path -> content, "/" separated, no leading slash). Pure: callers apply
 * the returned effect to their stores. `python <file>` is surfaced as
 * `runFile` for the caller to dispatch through the Python runner.
 */
export type ShellEffect = {
  /** lines to append to the terminal (after the echoed command) */
  lines: ConsoleLine[];
  /** working directory after the command ("" = project root) */
  cwd: string;
  /** project-relative path of a file to execute with python */
  runFile?: string;
  /** wipe the terminal instead of appending */
  clear?: boolean;
};

type Files = Record<string, string>;

export function promptFor(cwd: string): string {
  return `~${cwd ? `/${cwd}` : ""} $`;
}

/** Resolve an argument against cwd; "/" and "~" are the project root. */
export function resolvePath(cwd: string, arg: string): string {
  let parts: string[];
  if (arg.startsWith("/")) parts = arg.split("/");
  else if (arg === "~" || arg.startsWith("~/")) parts = arg.slice(1).split("/");
  else parts = [...(cwd ? cwd.split("/") : []), ...arg.split("/")];

  const resolved: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") resolved.pop();
    else resolved.push(part);
  }
  return resolved.join("/");
}

const isFile = (files: Files, path: string) => path in files;

function isDir(files: Files, path: string) {
  if (path === "") return true;
  const prefix = `${path}/`;
  return Object.keys(files).some((p) => p.startsWith(prefix));
}

function listDir(files: Files, path: string) {
  const prefix = path ? `${path}/` : "";
  const dirs = new Set<string>();
  const names: string[] = [];
  for (const p of Object.keys(files)) {
    if (!p.startsWith(prefix)) continue;
    const rest = p.slice(prefix.length);
    const slash = rest.indexOf("/");
    if (slash === -1) names.push(rest);
    else dirs.add(rest.slice(0, slash));
  }
  return [...[...dirs].sort().map((d) => `${d}/`), ...names.sort()];
}

const stdout = (text: string): ConsoleLine => ({ kind: "stdout", text });
const stderr = (text: string): ConsoleLine => ({ kind: "stderr", text });

const HELP = [
  "ls [path]        list files",
  "cd [path]        change directory",
  "pwd              print working directory",
  "cat <file>       print a file",
  "python <file>    run a file against the test graph",
  "clear            clear the terminal",
  "help             this message",
].join("\n");

export function runShellCommand(
  files: Files,
  cwd: string,
  input: string,
): ShellEffect {
  const done = (lines: ConsoleLine[] = []): ShellEffect => ({ lines, cwd });
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return done();
  const [cmd, ...args] = tokens;

  switch (cmd) {
    case "ls": {
      const target = args[0] ? resolvePath(cwd, args[0]) : cwd;
      if (isFile(files, target)) return done([stdout(args[0] ?? target)]);
      if (!isDir(files, target)) {
        return done([stderr(`ls: ${args[0] ?? target}: No such file or directory`)]);
      }
      const entries = listDir(files, target);
      return done(entries.length ? [stdout(entries.join("  "))] : []);
    }

    case "cd": {
      if (!args[0]) return { lines: [], cwd: "" };
      const target = resolvePath(cwd, args[0]);
      if (isDir(files, target)) return { lines: [], cwd: target };
      const reason = isFile(files, target)
        ? `not a directory: ${args[0]}`
        : `no such file or directory: ${args[0]}`;
      return done([stderr(`cd: ${reason}`)]);
    }

    case "pwd":
      return done([stdout(`/project${cwd ? `/${cwd}` : ""}`)]);

    case "cat": {
      if (!args[0]) return done([stderr("usage: cat <file>")]);
      const target = resolvePath(cwd, args[0]);
      if (isFile(files, target)) return done([stdout(files[target])]);
      const reason = isDir(files, target)
        ? "Is a directory"
        : "No such file or directory";
      return done([stderr(`cat: ${args[0]}: ${reason}`)]);
    }

    case "python":
    case "python3": {
      if (!args[0]) {
        return done([
          stderr(`${cmd}: interactive mode isn't available here — pass a file, e.g. ${cmd} main.py`),
        ]);
      }
      const target = resolvePath(cwd, args[0]);
      if (isFile(files, target)) return { lines: [], cwd, runFile: target };
      const reason = isDir(files, target)
        ? "Is a directory"
        : "[Errno 2] No such file or directory";
      return done([stderr(`${cmd}: can't open file '/project/${target}': ${reason}`)]);
    }

    case "clear":
      return { lines: [], cwd, clear: true };

    case "help":
      return done([{ kind: "info", text: HELP }]);

    default:
      return done([stderr(`sh: command not found: ${cmd}`)]);
  }
}
