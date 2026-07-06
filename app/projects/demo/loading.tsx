import { WorkspaceSkeleton } from "@/components/projects/workspace-skeleton";

/** Route-level fallback while the demo lessons and graph docs load. */
export default function DemoLoading() {
  return <WorkspaceSkeleton />;
}
