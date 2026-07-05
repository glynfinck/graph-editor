import { ForkButton } from "@/components/posts/fork-button";
import { ProjectFilesViewer } from "@/components/posts/project-files-viewer";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/** The post's attached project: read-only file browser + fork. */
export function AttachedProjectCard({
  postId,
  project,
  signedIn,
}: {
  postId: string;
  project: {
    id: string;
    name: string;
    description: string;
    files: { path: string; content: string }[];
  };
  signedIn: boolean;
}) {
  return (
    <Card className="mt-10 gap-0 overflow-hidden pb-0">
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base">{project.name}</CardTitle>
            <CardDescription className="mt-1">
              {project.description || "The project behind this post."}
            </CardDescription>
          </div>
          <ForkButton postId={postId} signedIn={signedIn} />
        </div>
      </CardHeader>
      <CardContent className="border-t p-0">
        <ProjectFilesViewer files={project.files} />
      </CardContent>
    </Card>
  );
}
