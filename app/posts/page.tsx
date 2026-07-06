import { redirect } from "next/navigation";

/** The posts feed merged into explore; the route stays for old links. */
export default function PostsPage() {
  redirect("/explore?type=posts");
}
