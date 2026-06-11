import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Trash2, Save, ImagePlus, FileText } from "lucide-react";

type Pin = { id: string; x: number; y: number; label: string; aliases: string[] };
type Diagram = {
  id: string;
  chapter_id: string;
  title: string;
  image_path: string;
  pins: Pin[];
  status: string;
  display_order: number;
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function DiagramsManager({ chapterId }: { chapterId: string }) {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: diagrams = [], isLoading } = useQuery({
    queryKey: ["admin-diagrams", chapterId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("diagram_labels")
        .select("*")
        .eq("chapter_id", chapterId)
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Diagram[];
    },
  });

  const selected = diagrams.find((d) => d.id === selectedId) ?? null;

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-diagrams", chapterId] });

  const handleCreate = async (file: File) => {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${chapterId}/${uid()}.${ext}`;
      const up = await supabase.storage.from("diagrams").upload(path, file, {
        contentType: file.type || undefined,
        upsert: false,
      });
      if (up.error) throw up.error;
      const ins = await supabase
        .from("diagram_labels")
        .insert({
          chapter_id: chapterId,
          title: newTitle.trim(),
          image_path: path,
          pins: [],
          status: "draft",
          display_order: diagrams.length,
        })
        .select("id")
        .single();
      if (ins.error) throw ins.error;
      setNewTitle("");
      if (fileRef.current) fileRef.current.value = "";
      setSelectedId(ins.data!.id);
      invalidate();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  const removeDiagram = async (d: Diagram) => {
    if (!confirm(`Delete diagram "${d.title}"?`)) return;
    await supabase.storage.from("diagrams").remove([d.image_path]);
    await supabase.from("diagram_labels").delete().eq("id", d.id);
    if (selectedId === d.id) setSelectedId(null);
    invalidate();
  };

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-xl bg-surface p-4 space-y-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Add diagram</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            placeholder="Title (e.g. Heart anatomy)"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            disabled={creating}
          />
          <Input
            ref={fileRef}
            type="file"
            accept="image/*"
            disabled={creating || !newTitle.trim()}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleCreate(f);
            }}
            className="sm:w-[280px]"
          />
        </div>
        {creating && (
          <p className="text-xs text-muted-foreground inline-flex items-center gap-2">
            <Loader2 className="size-3 animate-spin" /> Uploading…
          </p>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : diagrams.length === 0 ? (
        <p className="text-sm text-muted-foreground rounded-xl bg-surface p-4">No diagrams yet.</p>
      ) : (
        <div className="grid gap-2">
          {diagrams.map((d) => (
            <div
              key={d.id}
              className={
                "rounded-xl bg-surface p-3 flex items-center justify-between gap-2 cursor-pointer border " +
                (selectedId === d.id ? "border-primary" : "border-transparent")
              }
              onClick={() => setSelectedId(d.id === selectedId ? null : d.id)}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{d.title}</p>
                <p className="text-xs text-muted-foreground">{(d.pins ?? []).length} pins</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant={d.status === "approved" ? "default" : "secondary"}>{d.status}</Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeDiagram(d);
                  }}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && <DiagramEditor key={selected.id} diagram={selected} onChange={invalidate} chapterId={chapterId} />}
    </div>
  );
}

function DiagramEditor({
  diagram,
  onChange,
  chapterId,
}: {
  diagram: Diagram;
  onChange: () => void;
  chapterId: string;
}) {
  const qc = useQueryClient();
  const [pins, setPins] = useState<Pin[]>(diagram.pins ?? []);
  const [title, setTitle] = useState(diagram.title);
  const [status, setStatus] = useState(diagram.status);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    supabase.storage
      .from("diagrams")
      .createSignedUrl(diagram.image_path, 60 * 60)
      .then(({ data }) => setSignedUrl(data?.signedUrl ?? null));
  }, [diagram.image_path]);

  const dirty = useMemo(
    () =>
      title !== diagram.title ||
      status !== diagram.status ||
      JSON.stringify(pins) !== JSON.stringify(diagram.pins ?? []),
    [title, status, pins, diagram],
  );

  const getCoords = (e: React.MouseEvent) => {
    const el = containerRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    return { x, y };
  };

  const handleImageClick = (e: React.MouseEvent) => {
    if (dragId) return;
    const c = getCoords(e);
    if (!c) return;
    setPins((prev) => [...prev, { id: uid(), x: c.x, y: c.y, label: "", aliases: [] }]);
  };

  const updatePin = (id: string, patch: Partial<Pin>) =>
    setPins((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const removePin = (id: string) => setPins((prev) => prev.filter((p) => p.id !== id));

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("diagram_labels")
        .update({ title, status, pins: pins as unknown as object })
        .eq("id", diagram.id);
      if (error) throw error;
      onChange();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const insertIntoNotes = async () => {
    const { data: chapter } = await supabase
      .from("chapters")
      .select("summary_md")
      .eq("id", chapterId)
      .single();
    const current = chapter?.summary_md ?? "";
    const embed = `\n\n![${title}](diagram://${diagram.image_path})\n\n`;
    await supabase
      .from("chapters")
      .update({ summary_md: current + embed })
      .eq("id", chapterId);
    qc.invalidateQueries({ queryKey: ["admin-chapter", chapterId] });
    alert("Inserted into chapter notes.");
  };

  // Drag move
  useEffect(() => {
    if (!dragId) return;
    const onMove = (e: MouseEvent) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
      setPins((prev) => prev.map((p) => (p.id === dragId ? { ...p, x, y } : p)));
    };
    const onUp = () => setDragId(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragId]);

  return (
    <div className="rounded-xl bg-surface p-4 space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} className="sm:max-w-[320px]" />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setStatus(status === "approved" ? "draft" : "approved")}
          >
            {status === "approved" ? "Set draft" : "Approve"}
          </Button>
          <Button size="sm" variant="outline" onClick={insertIntoNotes}>
            <FileText className="size-4" /> Insert into chapter notes
          </Button>
          <Button size="sm" onClick={save} disabled={!dirty || saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Click anywhere on the image to add a pin. Drag pins to reposition. Status: <Badge>{status}</Badge>
      </p>

      <div
        ref={containerRef}
        className="relative inline-block max-w-full select-none"
        onClick={handleImageClick}
      >
        {signedUrl ? (
          <img
            ref={imgRef}
            src={signedUrl}
            alt={title}
            className="block max-w-full h-auto rounded-lg pointer-events-none"
            draggable={false}
          />
        ) : (
          <div className="p-6 text-sm text-muted-foreground">Loading image…</div>
        )}
        {pins.map((pin, idx) => (
          <button
            key={pin.id}
            onMouseDown={(e) => {
              e.stopPropagation();
              setDragId(pin.id);
            }}
            onClick={(e) => e.stopPropagation()}
            className="absolute -translate-x-1/2 -translate-y-1/2 size-6 rounded-full bg-primary text-primary-foreground text-xs font-bold shadow-md ring-2 ring-background flex items-center justify-center cursor-grab active:cursor-grabbing"
            style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}
            title={pin.label || `Pin ${idx + 1}`}
          >
            {idx + 1}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Pins</p>
        {pins.length === 0 && <p className="text-sm text-muted-foreground">No pins yet — click the image to add.</p>}
        {pins.map((pin, idx) => (
          <div key={pin.id} className="flex flex-col gap-2 sm:flex-row sm:items-center rounded-lg bg-background p-2">
            <span className="size-6 shrink-0 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
              {idx + 1}
            </span>
            <Input
              placeholder="Label (e.g. Left ventricle)"
              value={pin.label}
              onChange={(e) => updatePin(pin.id, { label: e.target.value })}
            />
            <Input
              placeholder="Aliases (comma-separated)"
              value={pin.aliases.join(", ")}
              onChange={(e) =>
                updatePin(pin.id, {
                  aliases: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
            <Button size="sm" variant="ghost" onClick={() => removePin(pin.id)} className="text-destructive">
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
