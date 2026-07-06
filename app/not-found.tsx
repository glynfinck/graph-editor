import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 items-center px-6 py-16">
      <Card className="w-full text-center">
        <CardHeader>
          <CardTitle>Page not found</CardTitle>
          <CardDescription>
            It may have been deleted, made private, or the link is wrong.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center gap-2">
          <Button asChild>
            <Link href="/">Home</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/explore">Explore</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
