import { createFileRoute } from "@tanstack/react-router";
import { StudentReports } from "@/components/admin/StudentReports";
import { pageTitle } from "@/lib/brand";

export const Route = createFileRoute("/_authenticated/admin/reports")({
  head: () => ({ meta: [{ title: pageTitle("Reported by students") }] }),
  component: ReportsPage,
});

function ReportsPage() {
  return (
    <div>
      <h1 className="font-display text-[28px]">Reported by students</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Problems students flagged from inside a question or flashcard. An open report blocks
        approving that item and publishing its chapter.
      </p>
      <div className="mt-5">
        <StudentReports />
      </div>
    </div>
  );
}
