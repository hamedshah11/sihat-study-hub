import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trash2, Save, FileText, Upload } from "lucide-react";

type Pin = { id: string; x: number; y: number; label: string; aliases: string[] };
type Diagram = {
  id: string;
  chapter_id: string;
  title: string;
  image_path: string;
  base_image_path: string | null;
  pins: Pin[];
  status: string;
  display_order: number;
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function newId() {
  return (crypto as { randomUUID?: () => string }).randomUUID?.() ?? uid();
}

export const NO_MANIFEST_NOTICE = "No pin manifest found in this SVG — add pins manually.";

type SvgManifest = { title: string | null; pins: Pin[]; blankSvg: string | null };

/**
 * Parse a labelled SVG for its `<metadata id="sihat-pins">` manifest.
 * Returns null when the manifest is missing, malformed, or fails validation
 * (never partially applied).
 */
export function parseLabelledSvg(text: string): SvgManifest | null {
  try {
    const doc = new DOMParser().parseFromString(text, "image/svg+xml");
    if (doc.querySelector("parsererror")) return null;
    const meta = doc.querySelector("metadata#sihat-pins") ?? doc.querySelector("#sihat-pins");
    const raw = meta?.textContent?.trim();
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;
    const entries = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { pins?: unknown })?.pins)
        ? ((parsed as { pins: unknown[] }).pins as unknown[])
        : null;
    if (!entries || entries.length === 0) return null;

    const pins: Pin[] = [];
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") return null;
      const e = entry as Record<string, unknown>;
      const label = typeof e.label === "string" ? e.label.trim() : "";
      const x = typeof e.x === "number" ? e.x : NaN;
      const y = typeof e.y === "number" ? e.y : NaN;
      if (!label) return null;
      if (!Number.isFinite(x) || x < 0 || x > 1) return null;
      if (!Number.isFinite(y) || y < 0 || y > 1) return null;
      pins.push({
        id: typeof e.id === "string" && e.id ? e.id : newId(),
        label,
        x,
        y,
        aliases: Array.isArray(e.aliases) ? e.aliases.map(String).filter(Boolean) : [],
      });
    }

    const title =
      !Array.isArray(parsed) && typeof (parsed as { title?: unknown }).title === "string"
        ? ((parsed as { title: string }).title.trim() || null)
        : null;

    // Blank (unlabelled) variant: strip the labels + manifest layers.
    const blankDoc = new DOMParser().parseFromString(text, "image/svg+xml");
    blankDoc.querySelector("#sihat-labels")?.remove();
    blankDoc.querySelector("#sihat-pins")?.remove();
    const blankSvg = new XMLSerializer().serializeToString(blankDoc);

    return { title, pins, blankSvg };
  } catch {
    return null;
  }
}


/** Resolve a storage path to a signed URL (bucket is private; public buckets blocked by policy). */
function useDiagramUrl(path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    supabase.storage
      .from("diagrams")
      .createSignedUrl(path, 60 * 60)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("[diagrams] signed url error", path, error);
          setUrl(null);
        } else {
          setUrl(data?.signedUrl ?? null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [path]);
  return url;
}

function Thumb({ path }: { path: string }) {
  const url = useDiagramUrl(path);
  if (!url) return <div className="size-12 rounded bg-background" />;
  return (
    <img
      src={url}
      alt=""
      className="size-12 rounded object-cover bg-background"
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.display = "none";
      }}
    />
  );
}

export function DiagramsManager({ chapterId }: { chapterId: string }) {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [importNotice, setImportNotice] = useState<string | null>(null);
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
    setCreating(true);
    setImportNotice(null);
    try {
      const isSvg = file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg");
      let manifest: SvgManifest | null = null;

      if (isSvg) {
        manifest = parseLabelledSvg(await file.text());
        if (!manifest) setImportNotice(NO_MANIFEST_NOTICE);
      }

      const titleToUse = (newTitle.trim() || manifest?.title || "").trim();
      if (!titleToUse) {
        alert("Please enter a title (no manifest found in file).");
        return;
      }

      // Upload labelled image
      const ext = file.name.split(".").pop() || (isSvg ? "svg" : "png");
      const path = `${chapterId}/${uid()}.${ext}`;
      const up = await supabase.storage.from("diagrams").upload(path, file, {
        contentType: file.type || (isSvg ? "image/svg+xml" : "image/png"),
        upsert: true,
      });
      if (up.error) throw up.error;
      const imagePath = up.data?.path ?? path;

      // Upload blank if generated
      let basePath: string | null = null;
      if (manifest?.blankSvg) {
        const blankPath = `${chapterId}/${uid()}-blank.svg`;
        const blob = new Blob([manifest.blankSvg], { type: "image/svg+xml" });
        const upB = await supabase.storage.from("diagrams").upload(blankPath, blob, {
          contentType: "image/svg+xml",
          upsert: true,
        });
        if (upB.error) throw upB.error;
        basePath = upB.data?.path ?? blankPath;
      }

      const ins = await supabase
        .from("diagram_labels")
        .insert({
          chapter_id: chapterId,
          title: titleToUse,
          image_path: imagePath,
          base_image_path: basePath,
          pins: (manifest?.pins ?? []) as unknown as never,
          status: "draft",
          display_order: diagrams.length,
        })
        .select("id")
        .single();
      if (ins.error) throw ins.error;
      setNewTitle("");
      if (fileRef.current) fileRef.current.value = "";
      setSelectedId(ins.data!.id);
      if (manifest) {
        toast.success(`Imported ${manifest.pins.length} pins from SVG`);
      }
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
            accept=".svg,image/*"
            disabled={creating}
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
        {importNotice && <p className="text-xs text-muted-foreground">{importNotice}</p>}
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
                "rounded-xl bg-surface p-3 flex items-center gap-3 cursor-pointer border " +
                (selectedId === d.id ? "border-primary" : "border-transparent")
              }
              onClick={() => setSelectedId(d.id === selectedId ? null : d.id)}
            >
              <Thumb path={d.image_path} />
              <div className="min-w-0 flex-1">
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
  const [basePath, setBasePath] = useState<string | null>(diagram.base_image_path ?? null);
  const [uploadingBase, setUploadingBase] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const baseFileRef = useRef<HTMLInputElement | null>(null);
  const signedUrl = useDiagramUrl(diagram.image_path);
  const baseSignedUrl = useDiagramUrl(basePath);

  useEffect(() => {
    setLoadError(null);
  }, [signedUrl]);

  const dirty = useMemo(
    () =>
      title !== diagram.title ||
      status !== diagram.status ||
      basePath !== (diagram.base_image_path ?? null) ||
      JSON.stringify(pins) !== JSON.stringify(diagram.pins ?? []),
    [title, status, basePath, pins, diagram],
  );

  const uploadBaseImage = async (file: File) => {
    setUploadingBase(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${chapterId}/${uid()}-blank.${ext}`;
      const up = await supabase.storage.from("diagrams").upload(path, file, {
        contentType: file.type || "image/png",
        upsert: true,
      });
      if (up.error) throw up.error;
      setBasePath(up.data?.path ?? path);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setUploadingBase(false);
      if (baseFileRef.current) baseFileRef.current.value = "";
    }
  };

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

  /** Re-import pins from a labelled SVG's `<metadata id="sihat-pins">` manifest. */
  const importPinsFromSvg = async (file: File) => {
    setImportNotice(null);
    const manifest = parseLabelledSvg(await file.text());
    if (pinFileRef.current) pinFileRef.current.value = "";
    if (!manifest) {
      setImportNotice(NO_MANIFEST_NOTICE);
      return;
    }
    if (pins.length > 0 && !confirm(`Replace the existing ${pins.length} pins with ${manifest.pins.length} from this SVG?`)) {
      return;
    }
    setPins(manifest.pins);
    toast.success(`Imported ${manifest.pins.length} pins from SVG`);
  };


  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("diagram_labels")
        .update({ title, status, pins: pins as unknown as never, base_image_path: basePath })
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
        className="relative w-full select-none"
        onClick={handleImageClick}
      >
        {signedUrl ? (
          <img
            src={signedUrl}
            alt={title}
            style={{ width: "100%", height: "auto", display: "block" }}
            className="rounded-lg pointer-events-none"
            draggable={false}
            onError={() => setLoadError(signedUrl)}
          />
        ) : (
          <div className="p-6 text-sm text-muted-foreground">Loading image…</div>
        )}
        {loadError && (
          <p className="absolute inset-x-0 top-0 p-2 text-xs text-destructive bg-background/80 break-all">
            Failed to load image from: {loadError}
          </p>
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

      {signedUrl && (
        <p className="text-xs text-muted-foreground break-all">
          Image URL:{" "}
          <a href={signedUrl} target="_blank" rel="noreferrer" className="underline">
            {signedUrl}
          </a>
        </p>
      )}
      <p className="text-xs text-muted-foreground">Storage path: {diagram.image_path}</p>

      <div className="rounded-lg bg-background p-3 space-y-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Blank image (shown to students during tests)
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            ref={baseFileRef}
            type="file"
            accept=".svg,.png,.webp,.jpg,.jpeg,image/svg+xml,image/png,image/webp,image/jpeg"
            disabled={uploadingBase}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadBaseImage(f);
            }}
            className="sm:max-w-[320px]"
          />
          {uploadingBase && (
            <span className="text-xs text-muted-foreground inline-flex items-center gap-2">
              <Loader2 className="size-3 animate-spin" /> Uploading…
            </span>
          )}
          {basePath && (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              onClick={() => setBasePath(null)}
            >
              <Trash2 className="size-4" /> Remove
            </Button>
          )}
        </div>
        {basePath ? (
          <div className="flex items-start gap-3">
            {baseSignedUrl ? (
              <img
                src={baseSignedUrl}
                alt="Blank version"
                className="max-h-32 rounded border bg-background"
              />
            ) : (
              <div className="size-20 rounded bg-background" />
            )}
            <div className="min-w-0 flex-1 space-y-1">
              {baseSignedUrl && (
                <p className="text-xs text-muted-foreground break-all">
                  Blank URL:{" "}
                  <a href={baseSignedUrl} target="_blank" rel="noreferrer" className="underline">
                    {baseSignedUrl}
                  </a>
                </p>
              )}
              <p className="text-xs text-muted-foreground break-all">Storage path: {basePath}</p>
              <p className="text-xs text-muted-foreground">
                Remember to click Save to persist this blank image.
              </p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            No blank image yet — students will see the labelled image during tests until one is set.
          </p>
        )}
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
