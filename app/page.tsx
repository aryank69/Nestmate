import { HeroSection } from "@/components/hero-section";
import { Navbar } from "@/components/navbar";

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <HeroSection />
      </main>
    </>
  );
}
