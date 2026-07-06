import { redirect } from "next/navigation";

/** The graphs list moved into the library; the route stays for old links. */
export default function GraphsPage() {
  redirect("/library?tab=graphs");
}
