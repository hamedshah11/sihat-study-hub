import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, email, batch_id, student_type, role")
        .eq("id", user.id)
        .maybeSingle();
      let batchName: string | null = null;
      if (profile?.batch_id) {
        const { data: b } = await supabase.from("batches").select("name").eq("id", profile.batch_id).maybeSingle();
        batchName = b?.name ?? null;
      }
      return {
        displayName: profile?.display_name || "—",
        email: profile?.email || user.email || "",
        batch: batchName,
        studentType: profile?.student_type,
        role: profile?.role ?? "student",
      };
    },
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    qc.clear();
    router.invalidate();
    navigate({ to: "/login" });
  };

  const elevatedRole = data?.roles.find((r) => r === "admin" || r === "instructor");

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
