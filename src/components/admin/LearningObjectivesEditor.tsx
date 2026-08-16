import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { parseLearningObjectives, serialiseLearningObjectives } from "@/lib/learningObjectives";

// Repeatable editor for chapters.learning_objectives. Order is meaningful and
// is saved exactly as shown, so reordering is part of the editing surface
// rather than something inferred at read time.
//
// Rows are kept in local state (including blank ones, so a freshly added row
// can be typed into) and only cleaned on save. An all-blank list saves as NULL,
// which is what makes the student-side block disappear entirely.
export function LearningObjectivesEditor({
  chapterId,
  value,
  onSaved,
}: {
  chapterId: string;
  value: unknown;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const saved = parseLearningObjectives(value);
  const [rows, setRows] = useState<string[]>(saved);
  const [busy, setBusy] = useState(false);

  const dirty =
    rows.length !== saved.length || rows.some((row, i) => row.trim() !== (saved[i] ?? ""));

  const update = (index: number, next: string) =>
    setRows((prev) => prev.map((row, i) => (i === index ? next : row)));

  const add = () => setRows((prev) => [...prev, ""]);

  const remove = (index: number) => setRows((prev) => prev.filter((_, i) => i !== index));

  const move = (index: number, delta: number) =>
    setRows((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = prev.slice();
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const save = async () => {
    setBusy(true);
    const payload = serialiseLearningObjectives(rows);
    const { error } = await supabase
      .from("chapters")
      .update({ learning_objectives: payload })
      .eq("id", chapterId);
    setBusy(false);
    if (error) {
      toast.error(`Could not save learning objectives: ${error.message}`);
      return;
    }
    // Reflect what was actually stored — blanks are dropped on save.
    setRows(payload ?? []);
    toast.success(
      payload === null
        ? "Learning objectives cleared"
        : `Saved ${payload.length} learning objective${payload.length === 1 ? "" : "s"}`,
    );
    qc.invalidateQueries({ queryKey: ["chapter-detail", chapterId] });
    onSaved();
  };

  const reset = () => setRows(saved);

  return (
    <div className="rounded-xl bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Learning objectives
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Shown to students above the notes. Leave empty to hide the block entirely.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={add} disabled={busy}>
          <Plus className="size-4" /> Add objective
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No learning objectives for this chapter.
        </p>
      ) : (
        <ol className="mt-3 space-y-2">
          {rows.map((row, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-2 w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {i + 1}.
              </span>
              <Input
                value={row}
                onChange={(e) => update(i, e.target.value)}
                placeholder="Describe what a student should be able to do…"
                disabled={busy}
                aria-label={`Learning objective ${i + 1}`}
              />
              <div className="flex shrink-0 items-center">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => move(i, -1)}
                  disabled={busy || i === 0}
                  aria-label={`Move objective ${i + 1} up`}
                >
                  <ArrowUp className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => move(i, 1)}
                  disabled={busy || i === rows.length - 1}
                  aria-label={`Move objective ${i + 1} down`}
                >
                  <ArrowDown className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(i)}
                  disabled={busy}
                  aria-label={`Remove objective ${i + 1}`}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={save} disabled={busy || !dirty}>
          {busy ? "Saving…" : "Save objectives"}
        </Button>
        {dirty && (
          <Button variant="outline" size="sm" onClick={reset} disabled={busy}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
