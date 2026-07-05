import { describe, expect, it } from "vitest";

import { promptFor, resolvePath, runShellCommand } from "@/lib/projects/shell";

const FILES = {
  "main.py": "print('hi')",
  "helpers.py": "def x(): pass",
  "algos/dijkstra.py": "import heapq",
  "algos/data/weights.json": "{}",
  "README.md": "# readme",
};

describe("resolvePath", () => {
  it("resolves relative, absolute, ~, . and ..", () => {
    expect(resolvePath("", "algos")).toBe("algos");
    expect(resolvePath("algos", "data")).toBe("algos/data");
    expect(resolvePath("algos", "..")).toBe("");
    expect(resolvePath("algos/data", "../../main.py")).toBe("main.py");
    expect(resolvePath("algos", "/main.py")).toBe("main.py");
    expect(resolvePath("algos", "~/helpers.py")).toBe("helpers.py");
    expect(resolvePath("algos", "./dijkstra.py")).toBe("algos/dijkstra.py");
  });

  it("cannot escape the project root", () => {
    expect(resolvePath("", "../../..")).toBe("");
    expect(resolvePath("", "/../main.py")).toBe("main.py");
  });
});

describe("runShellCommand", () => {
  it("ls lists directories first, with trailing slash", () => {
    const effect = runShellCommand(FILES, "", "ls");
    expect(effect.lines[0].text).toBe("algos/  README.md  helpers.py  main.py");
  });

  it("ls of a subdirectory and of a missing path", () => {
    expect(runShellCommand(FILES, "", "ls algos").lines[0].text).toBe(
      "data/  dijkstra.py",
    );
    const missing = runShellCommand(FILES, "", "ls nope");
    expect(missing.lines[0].kind).toBe("stderr");
    expect(missing.lines[0].text).toContain("No such file or directory");
  });

  it("cd changes directory, validates targets, and cd alone goes home", () => {
    expect(runShellCommand(FILES, "", "cd algos").cwd).toBe("algos");
    expect(runShellCommand(FILES, "algos", "cd data").cwd).toBe("algos/data");
    expect(runShellCommand(FILES, "algos/data", "cd").cwd).toBe("");
    expect(runShellCommand(FILES, "", "cd main.py").lines[0].text).toBe(
      "cd: not a directory: main.py",
    );
    expect(runShellCommand(FILES, "", "cd nope").lines[0].kind).toBe("stderr");
  });

  it("pwd reflects the project mount", () => {
    expect(runShellCommand(FILES, "", "pwd").lines[0].text).toBe("/project");
    expect(runShellCommand(FILES, "algos", "pwd").lines[0].text).toBe(
      "/project/algos",
    );
  });

  it("cat prints files and rejects directories", () => {
    expect(runShellCommand(FILES, "", "cat main.py").lines[0].text).toBe(
      "print('hi')",
    );
    expect(runShellCommand(FILES, "", "cat algos").lines[0].text).toContain(
      "Is a directory",
    );
  });

  it("python resolves the file against cwd and surfaces it as runFile", () => {
    expect(runShellCommand(FILES, "", "python main.py").runFile).toBe("main.py");
    expect(runShellCommand(FILES, "algos", "python dijkstra.py").runFile).toBe(
      "algos/dijkstra.py",
    );
    expect(runShellCommand(FILES, "algos", "python3 ../main.py").runFile).toBe(
      "main.py",
    );
  });

  it("python errors match the real interpreter's shape", () => {
    const effect = runShellCommand(FILES, "", "python nope.py");
    expect(effect.runFile).toBeUndefined();
    expect(effect.lines[0].text).toBe(
      "python: can't open file '/project/nope.py': [Errno 2] No such file or directory",
    );
  });

  it("clear, unknown commands, and empty input", () => {
    expect(runShellCommand(FILES, "", "clear").clear).toBe(true);
    expect(runShellCommand(FILES, "", "frobnicate").lines[0].text).toBe(
      "sh: command not found: frobnicate",
    );
    expect(runShellCommand(FILES, "", "   ").lines).toEqual([]);
  });
});

describe("promptFor", () => {
  it("renders the cwd like a home-relative shell prompt", () => {
    expect(promptFor("")).toBe("~ $");
    expect(promptFor("algos/data")).toBe("~/algos/data $");
  });
});
