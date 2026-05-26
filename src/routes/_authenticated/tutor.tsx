import { createFileRoute } from "@tanstack/react-router";
import { Placeholder } from "./subjects";

export const Route = createFileRoute("/_authenticated/tutor")({
  head: () => ({ meta: [{ title: "Tutor — Sihat" }] }),
  component: () => <Placeholder title="AI Tutor" body="Chat with your AI tutor about any chapter — coming soon." />,
});
