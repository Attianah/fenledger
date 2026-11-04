import { createFileRoute } from "@tanstack/react-router";
import { Converter } from "@/components/converter";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <main>
      <Converter />
    </main>
  );
}
