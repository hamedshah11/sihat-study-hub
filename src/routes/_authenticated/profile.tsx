import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Profile — Sihat" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const navigate = useNavigate();
  const router = useRouter();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["profile-page"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const [{ data: profile }, { data: allBadges }, { data: earned }] = await Promise.all([
        supabase.from("profiles").select("display_name, email, batch_id, student_type, role").eq("id", user.id).maybeSingle(),
        supabase.from("badges").select("id, name, description, icon"),
        supabase.from("user_badges").select("badge_id, earned_at").eq("user_id", user.id),
      ]);
      let batchName: string | null = null;
      if (profile?.batch_id) {
        const { data: b } = await supabase.from("batches").select("name").eq("id", profile.batch_id).maybeSingle();
        batchName = b?.name ?? null;
      }
      const earnedMap = new Map((earned ?? []).map((e: any) => [e.badge_id as string, e.earned_at as string]));
      const badges = (allBadges ?? []).map((b: any) => ({
        id: b.id as string,
        name: b.name as string,
        description: b.description as string,
        icon: (b.icon ?? "🏅") as string,
        earnedAt: earnedMap.get(b.id) ?? null,
      })).sort((a, b) => Number(!!b.earnedAt) - Number(!!a.earnedAt));
      return {
        displayName: profile?.display_name || "—",
        email: profile?.email || user.email || "",
        batch: batchName,
        studentType: profile?.student_type,
        role: profile?.role ?? "student",
        badges,
      };
    },
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    qc.clear();
    router.invalidate();
    navigate({ to: "/login" });
  };

  const elevatedRole = data?.role === "admin" || data?.role === "instructor" ? data.role : null;

  return (
    <div>
      <h1 className="text-2xl font-bold text-primary">Profile</h1>

      <div className="mt-6 rounded-xl bg-surface p-5 space-y-4">
        <Row label="Display name" value={data?.displayName} />
        <Row label="Email" value={data?.email} />
        <Row label="Batch" value={data?.batch ?? "Not assigned"} />
        <Row label="Student type" value={data?.studentType ?? "—"} />
        {elevatedRole && (
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Role</p>
            <Badge className="mt-1 bg-accent text-accent-foreground capitalize">{elevatedRole}</Badge>
          </div>
        )}
      </div>

      {(data?.role === "admin" || data?.role === "instructor") && (
        <TestGenerateContent />
      )}

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-primary">Badges</h2>
        <div className="mt-3 grid grid-cols-4 gap-3">
          {(data?.badges ?? []).map((b) => {
            const earned = !!b.earnedAt;
            return (
              <div
                key={b.id}
                title={earned ? `Earned ${new Date(b.earnedAt!).toLocaleDateString()}` : b.description}
                className={`flex flex-col items-center text-center rounded-xl border p-3 ${
                  earned ? "bg-accent/10 border-accent/30" : "bg-muted/40 border-muted opacity-60"
                }`}
              >
                <span className={`text-2xl ${earned ? "" : "grayscale"}`}>{b.icon}</span>
                <p className={`mt-1 text-xs font-semibold leading-tight ${earned ? "text-foreground" : "text-muted-foreground"}`}>
                  {b.name}
                </p>
                <p className="mt-1 text-[10px] text-muted-foreground leading-tight line-clamp-2">
                  {earned
                    ? new Date(b.earnedAt!).toLocaleDateString(undefined, { month: "short", day: "numeric" })
                    : b.description}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <Button
        onClick={handleLogout}
        variant="outline"
        className="mt-8 w-full h-12 rounded-lg border-destructive text-destructive hover:bg-destructive/5 hover:text-destructive"
      >
        Log out
      </Button>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-foreground">{value || "—"}</p>
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
    <div className="mt-6 rounded-xl bg-surface p-4">
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
