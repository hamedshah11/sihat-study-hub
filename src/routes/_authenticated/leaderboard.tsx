import { createFileRoute, redirect } from "@tanstack/react-router";

// The weekly leaderboard was replaced by the Batch tab in the Florence
// redesign: progress is private by default and never ranked. Old links and
// bookmarks land on Batch instead.
export const Route = createFileRoute("/_authenticated/leaderboard")({
  beforeLoad: () => {
    throw redirect({ to: "/batch", replace: true });
  },
});
