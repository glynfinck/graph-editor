import { WorkspaceSkeleton } from "@/components/projects/workspace-skeleton";

/** Route-level fallback while the project, its files and graphs load. */
export default function ProjectLoading() {
  return <WorkspaceSkeleton />;
}
