import { createFileRoute } from "@tanstack/react-router";
import { SpeedOnThisPhone } from "@/components/SpeedOnThisPhone";
import { pageTitle } from "@/lib/brand";

// Not linked from anywhere: a page to open on a phone after using the app,
// to see how long its requests took (docs/measuring-speed.md). It reads only
// this tab's own request timings.
export const Route = createFileRoute("/_authenticated/speed")({
  head: () => ({ meta: [{ title: pageTitle("Speed") }] }),
  component: SpeedPage,
});

function SpeedPage() {
  return (
    <div>
      <h1 className="font-display text-[28px]">Speed</h1>
      <div className="mt-5">
        <SpeedOnThisPhone />
      </div>
    </div>
  );
}
