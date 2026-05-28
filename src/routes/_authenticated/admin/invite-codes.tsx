import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/invite-codes")({
  head: () => ({ meta: [{ title: "Invite codes — Sihat" }] }),
  component: InviteCodesPage,
});

type InviteCode = {
  code: string;
  batch_id: string | null;
  max_uses: number | null;
  used_count: number | null;
  expires_at: string | null;
  created_at: string | null;
};
type Batch = { id: string; name: string };

function generateCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  for (let i = 0; i < 4; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return `SI-BSN-${out}`;
}

function InviteCodesPage() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-invite-codes"],
    queryFn: async () => {
      const [{ data: codes, error: ce }, { data: batches, error: be }] = await Promise.all([
        supabase.from("invite_codes").select("*").order("created_at", { ascending: false }),
        supabase.from("batches").select("id, name"),
      ]);
      if (ce) throw new Error(ce.message);
      if (be) throw new Error(be.message);
      return {
        codes: (codes ?? []) as InviteCode[],
        batches: (batches ?? []) as Batch[],
      };
    },
  });

  const revoke = async (code: string) => {
    if (!confirm(`Revoke invite code ${code}?`)) return;
    const { error } = await supabase.from("invite_codes").delete().eq("code", code);
    if (error) {
      alert(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["admin-invite-codes"] });
  };

  const batchName = (id: string | null) =>
    id ? data?.batches.find((b) => b.id === id)?.name ?? "—" : "—";

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">Invite codes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Generate and revoke signup invite codes.
          </p>
        </div>
        <CreateCodeDialog batches={data?.batches ?? []} />
      </div>

      <div className="mt-6 rounded-xl bg-surface p-2 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Batch</TableHead>
              <TableHead>Uses</TableHead>
              <TableHead>State</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={5} className="text-muted-foreground">Loading…</TableCell></TableRow>
            )}
            {data?.codes.map((c) => {
              const used = (c.used_count ?? 0) > 0;
              const exhausted = c.max_uses != null && (c.used_count ?? 0) >= c.max_uses;
              const expired = c.expires_at ? new Date(c.expires_at).getTime() < Date.now() : false;
              const state = expired
                ? { label: "Expired", cls: "bg-muted text-muted-foreground" }
                : exhausted
                  ? { label: "Exhausted", cls: "bg-muted text-muted-foreground" }
                  : used
                    ? { label: "In use", cls: "bg-accent text-accent-foreground" }
                    : { label: "Unused", cls: "bg-secondary text-secondary-foreground" };
              return (
                <TableRow key={c.code}>
                  <TableCell className="font-mono text-sm">{c.code}</TableCell>
                  <TableCell>{batchName(c.batch_id)}</TableCell>
                  <TableCell>
                    {c.used_count ?? 0}{c.max_uses != null ? ` / ${c.max_uses}` : ""}
                  </TableCell>
                  <TableCell><Badge className={state.cls}>{state.label}</Badge></TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => revoke(c.code)}>
                      Revoke
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {data && data.codes.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-muted-foreground">No invite codes yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function CreateCodeDialog({ batches }: { batches: Batch[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [batchId, setBatchId] = useState<string>("none");
  const [maxUses, setMaxUses] = useState("100");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lastCode, setLastCode] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    const code = generateCode();
    const { error } = await supabase.from("invite_codes").insert({
      code,
      batch_id: batchId === "none" ? null : batchId,
      max_uses: Number(maxUses) || 100,
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setLastCode(code);
    qc.invalidateQueries({ queryKey: ["admin-invite-codes"] });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setBatchId("none");
          setMaxUses("100");
          setErr(null);
          setLastCode(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button><Plus className="size-4" /> Create code</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Create invite code</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Batch (optional)</p>
            <Select value={batchId} onValueChange={setBatchId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No batch</SelectItem>
                {batches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Max uses</p>
            <input
              type="number"
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
          {lastCode && (
            <div className="rounded-lg bg-surface p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Generated code</p>
              <p className="mt-1 font-mono text-lg text-primary">{lastCode}</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Creating…" : lastCode ? "Generate another" : "Generate code"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
