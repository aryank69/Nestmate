import { redirect } from "next/navigation";

export default function PgsPage() {
  redirect("/rooms?kind=PG_AVAILABLE");
}
