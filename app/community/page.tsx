import { CommunityDirectory } from "@/components/community/community-directory";
import { Navbar } from "@/components/navbar";
import { loadCommunityLocations } from "@/lib/community-data";

export default async function LocalityCommunityDirectoryPage() {
  const locations = await loadCommunityLocations();

  return (
    <>
      <Navbar />
      <main className="min-h-[calc(100svh-4.5rem)]">
        <CommunityDirectory locations={locations} />
      </main>
    </>
  );
}
