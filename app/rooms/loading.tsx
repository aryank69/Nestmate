import { Navbar } from "@/components/navbar";

export default function FindRoomLoading() {
  return (
    <>
      <Navbar />
      <main className="min-h-[calc(100svh-4.5rem)] bg-muted/15">
        <section className="border-b border-border/70 bg-card/45">
          <div className="content-shell animate-pulse py-12">
            <div className="h-4 w-28 rounded-full bg-muted" />
            <div className="mt-5 h-14 max-w-3xl rounded-2xl bg-muted" />
            <div className="mt-8 h-72 rounded-3xl border border-border bg-card" />
          </div>
        </section>
        <section className="content-shell grid animate-pulse gap-5 py-10 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-[34rem] rounded-3xl border border-border bg-card" />
          ))}
        </section>
      </main>
    </>
  );
}
