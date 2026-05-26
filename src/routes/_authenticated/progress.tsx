import { createFileRoute } from "@tanstack/react-router";
import { Placeholder } from "@/components/Placeholder";

export const Route = createFileRoute("/_authenticated/progress")({
  head: () => ({ meta: [{ title: "Progress — Sihat" }] }),
  component: () => <Placeholder title="Progress" body="Your streak, completion, and study time will appear here." />,
});
