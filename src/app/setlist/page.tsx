import { redirect } from "next/navigation";
import { getActiveSetlist } from "@/lib/setlist";

export const dynamic = "force-dynamic";

export default async function SetlistPage() {
  const setlist = await getActiveSetlist();
  redirect(setlist ? `/service/${setlist.id}` : "/service");
}
