import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { requireAdmin } from "@/lib/admin.functions";
import { Shield, CheckCircle2, XCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/diagnostics")({
  beforeLoad: async () => {
    try {
      await requireAdmin();
    } catch {
      throw redirect({ to: "/home" });
    }
  },
  head: () => ({ meta: [{ title: "Diagnostics — Sihat" }] }),
  component: DiagnosticsPage,
});

type CheckResult =
  | { status: "success"; value: string }
  | { status: "error"; message: string };

function DiagnosticsPage() {
  const { data: checks, isLoading } = useQuery({
    queryKey: ["admin-diagnostics"],
    queryFn: async () => {
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      const results: Record<string, CheckResult> = {};

      // 1. User email & role
      if (userErr || !user) {
        results["User session"] = {
          status: "error",
          message: userErr?.message ?? "No authenticated user",
        };
        return results;
      }

      // Fetch profile
      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("email, role, batch_id, student_type")
        .eq("id", user.id)
        .maybeSingle();

      results["User session"] = {
        status: "success",
        value: `${user.email} (${profile?.role ?? "unknown"})`,
      };

      // 2. Profile row
      if (profileErr) {
        results["Profile row"] = { status: "error", message: profileErr.message };
      } else if (!profile) {
        results["Profile row"] = { status: "error", message: "Profile row missing" };
      } else {
        results["Profile row"] = { status: "success", value: "Exists" };
      }

      // 3. Streak row
      const { data: streak, error: streakErr } = await supabase
        .from("streaks")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (streakErr) {
        results["Streak row"] = { status: "error", message: streakErr.message };
      } else if (!streak) {
        results["Streak row"] = { status: "error", message: "Streak row missing" };
      } else {
        results["Streak row"] = { status: "success", value: "Exists" };
      }

      // 4. Subjects
      const { data: subjects, error: subjectsErr } = await supabase
        .from("subjects")
        .select("id")
        .limit(1);

      if (subjectsErr) {
        results["Subjects load"] = { status: "error", message: subjectsErr.message };
      } else {
        results["Subjects load"] = {
          status: "success",
          value: `${subjects?.length ?? 0} loaded`,
        };
      }

      // 5. Published chapters
      const { data: chapters, error: chaptersErr } = await supabase
        .from("chapters")
        .select("id")
        .eq("status", "published")
        .limit(1);

      if (chaptersErr) {
        results["Published chapters"] = { status: "error", message: chaptersErr.message };
      } else {
        results["Published chapters"] = {
          status: "success",
          value: `${chapters?.length ?? 0} loaded`,
        };
      }

      // 6. Approved questions
      const { data: questions, error: questionsErr } = await supabase
        .from("questions")
        .select("id")
        .eq("status", "approved")
        .limit(1);

      if (questionsErr) {
        results["Approved questions"] = { status: "error", message: questionsErr.message };
      } else {
        results["Approved questions"] = {
          status: "success",
          value: `${questions?.length ?? 0} loaded`,
        };
      }

      // 7. Approved flashcards
      const { data: flashcards, error: flashcardsErr } = await supabase
        .from("flashcards")
        .select("id")
        .eq("status", "approved")
        .limit(1);

      if (flashcardsErr) {
        results["Approved flashcards"] = { status: "error", message: flashcardsErr.message };
      } else {
        results["Approved flashcards"] = {
          status: "success",
          value: `${flashcards?.length ?? 0} loaded`,
        };
      }

      return results;
    },
  });

  const entries = checks ? Object.entries(checks) : [];

  return (
    <div>
      <div className="flex items-center gap-2">
        <Shield className="size-5 text-accent" />
        <h1 className="text-2xl font-bold text-primary">Diagnostics</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Admin-only system health checks.
      </p>

      <div className="mt-6 space-y-3">
        {isLoading &&
          Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse rounded-xl bg-surface p-4 h-[72px]"
            />
          ))}

        {entries.map(([name, result]) => (
          <div
            key={name}
            className="flex items-start gap-3 rounded-xl bg-surface p-4"
          >
            {result.status === "success" ? (
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-500" />
            ) : (
              <XCircle className="mt-0.5 size-5 shrink-0 text-red-500" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{name}</p>
              {result.status === "success" ? (
                <p className="text-sm text-muted-foreground">{result.value}</p>
              ) : (
                <p className="text-sm text-red-400 break-words">{result.message}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      <TestGenerateContent />
    </div>
  );
}

const SAMPLE_SOURCE = `Cells are the fundamental structural, functional, and biological units of all known living organisms. Often called the "building blocks of life," cells were first described by Robert Hooke in 1665 when he observed cork tissue under a primitive microscope and noted small compartments that reminded him of monks' rooms, or "cellae." Since then, advances in microscopy and molecular biology have revealed the extraordinary complexity hidden within these microscopic units.

There are two broad categories of cells: prokaryotic and eukaryotic. Prokaryotic cells, found in bacteria and archaea, lack a true nucleus and membrane-bound organelles. Their genetic material floats freely in a region called the nucleoid. Eukaryotic cells, which make up plants, animals, fungi, and protists, are larger and far more complex. They contain a defined nucleus that houses DNA and a variety of specialized organelles, each performing distinct tasks.

The cell membrane, a phospholipid bilayer studded with proteins, surrounds every cell and controls the movement of substances in and out. This selective permeability is essential for maintaining homeostasis. Inside, the cytoplasm provides a gel-like environment where chemical reactions take place. Suspended in the cytoplasm are organelles such as mitochondria, which generate ATP through cellular respiration; ribosomes, which synthesize proteins; the endoplasmic reticulum, which processes and transports those proteins; and the Golgi apparatus, which packages them for delivery.

Plant cells contain additional structures, including chloroplasts for photosynthesis and a rigid cell wall made of cellulose that provides shape and protection. Lysosomes, found mainly in animal cells, digest waste materials and worn-out organelles, recycling their components.

Cells reproduce through division. Mitosis produces two genetically identical daughter cells and is responsible for growth, tissue repair, and asexual reproduction. Meiosis, by contrast, produces gametes—sperm and egg cells—with half the chromosome number, enabling sexual reproduction and genetic diversity.

For nursing students, understanding cells is foundational. Drug actions, infections, wound healing, fluid and electrolyte balance, cancer treatments, and immune responses all begin at the cellular level. A nurse who understands how cells take in nutrients, communicate, and die can better anticipate patient responses, recognize complications early, and explain conditions to patients in clear, accurate language. From administering antibiotics that target bacterial cell walls to monitoring chemotherapy patients whose rapidly dividing cells are affected, cellular biology is woven into everyday nursing practice.`;

function TestGenerateContent() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const { data: chapter, error: chErr } = await supabase
        .from("chapters")
        .select("id")
        .eq("title", "Introduction to Cells")
        .maybeSingle();
      if (chErr) throw new Error(chErr.message);
      if (!chapter) throw new Error('Chapter "Introduction to Cells" not found');

      const { data, error: fnErr } = await supabase.functions.invoke("generate-content", {
        body: { chapterId: chapter.id, sourceMaterial: SAMPLE_SOURCE },
      });
      if (fnErr) throw new Error(fnErr.message);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-8 rounded-xl bg-surface p-4">
      <h2 className="text-lg font-semibold text-foreground">Test generate-content</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Calls the edge function with a 500-word sample about cells. Takes 30–60 seconds.
      </p>
      <Button onClick={handleClick} disabled={loading} className="mt-3">
        {loading ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Generating… (30–60s)
          </>
        ) : (
          "Test generate-content"
        )}
      </Button>

      {error && (
        <pre className="mt-4 max-h-96 overflow-auto rounded-lg bg-background p-3 text-xs text-red-400 whitespace-pre-wrap">
          {error}
        </pre>
      )}
      {result !== null && (
        <pre className="mt-4 max-h-96 overflow-auto rounded-lg bg-background p-3 text-xs text-foreground whitespace-pre-wrap">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
