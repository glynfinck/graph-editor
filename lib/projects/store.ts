"use client";

import { create } from "zustand";

type ProjectState = {
  projectId: string;
  name: string;
  description: string;
  /** path -> content, the working tree */
  files: Record<string, string>;
  openPath: string | null;
  activeGraphId: string | null;
  /** graphs pinned to the project ("This project" picker group), in order */
  graphIds: string[];
  dirty: boolean;

  init: (project: {
    id: string;
    name: string;
    description: string;
    activeGraphId: string | null;
    graphIds: string[];
    files: { path: string; content: string }[];
    /** file to open on load; falls back to preferredOpen when absent/missing */
    openPath?: string;
  }) => void;
  setName: (name: string) => void;
  openFile: (path: string) => void;
  setContent: (path: string, content: string) => void;
  addFile: (path: string) => void;
  renameFile: (from: string, to: string) => void;
  deleteFile: (path: string) => void;
  setActiveGraph: (graphId: string | null) => void;
  unpinGraph: (graphId: string) => void;
  markSaved: () => void;
  toPayload: () => {
    name: string;
    description: string;
    activeGraphId: string | null;
    graphIds: string[];
    files: { path: string; content: string }[];
  };
};

function preferredOpen(files: Record<string, string>): string | null {
  if ("main.py" in files) return "main.py";
  return Object.keys(files).sort()[0] ?? null;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projectId: "",
  name: "",
  description: "",
  files: {},
  openPath: null,
  activeGraphId: null,
  graphIds: [],
  dirty: false,

  init: (project) => {
    const files = Object.fromEntries(
      project.files.map((file) => [file.path, file.content]),
    );
    set({
      projectId: project.id,
      name: project.name,
      description: project.description,
      activeGraphId: project.activeGraphId,
      graphIds: project.graphIds,
      files,
      openPath:
        project.openPath && project.openPath in files
          ? project.openPath
          : preferredOpen(files),
      dirty: false,
    });
  },

  setName: (name) => set({ name, dirty: true }),

  openFile: (path) =>
    set((state) => (path in state.files ? { openPath: path } : {})),

  setContent: (path, content) =>
    set((state) =>
      path in state.files
        ? { files: { ...state.files, [path]: content }, dirty: true }
        : {},
    ),

  addFile: (path) => {
    const { files } = get();
    if (path in files) return;
    set((state) => ({
      files: { ...state.files, [path]: "" },
      openPath: path,
      dirty: true,
    }));
  },

  renameFile: (from, to) => {
    const { files } = get();
    if (!(from in files) || to in files) return;
    set((state) => {
      const next = { ...state.files };
      next[to] = next[from];
      delete next[from];
      return {
        files: next,
        openPath: state.openPath === from ? to : state.openPath,
        dirty: true,
      };
    });
  },

  deleteFile: (path) => {
    const { files } = get();
    if (!(path in files) || Object.keys(files).length <= 1) return;
    set((state) => {
      const next = { ...state.files };
      delete next[path];
      return {
        files: next,
        openPath: state.openPath === path ? preferredOpen(next) : state.openPath,
        dirty: true,
      };
    });
  },

  // the active graph is always among the pins — selecting pins it
  setActiveGraph: (graphId) =>
    set((state) => ({
      activeGraphId: graphId,
      graphIds:
        graphId && !state.graphIds.includes(graphId)
          ? [...state.graphIds, graphId]
          : state.graphIds,
      dirty: true,
    })),

  unpinGraph: (graphId) =>
    set((state) => ({
      graphIds: state.graphIds.filter((id) => id !== graphId),
      activeGraphId:
        state.activeGraphId === graphId ? null : state.activeGraphId,
      dirty: true,
    })),

  markSaved: () => set({ dirty: false }),

  toPayload: () => {
    const state = get();
    return {
      name: state.name,
      description: state.description,
      activeGraphId: state.activeGraphId,
      graphIds: state.graphIds,
      files: Object.entries(state.files).map(([path, content]) => ({
        path,
        content,
      })),
    };
  },
}));
