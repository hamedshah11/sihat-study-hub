import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSessionUserId } from "@/hooks/use-session-user";
import { isOffline } from "@/lib/offline-session";
import {
  chapterImagePaths,
  contentVersion,
  createDownloadStore,
  indexedDbBackend,
  refreshDownloads,
  type ChapterContent,
  type ChapterImage,
  type ChapterSource,
  type DownloadStore,
  type DownloadedChapterMeta,
  type DownloadedSubject,
  type DownloadedSubjectInfo,
} from "@/lib/offline-store";

// The network side of offline downloads: reading a chapter from Supabase
// (the RLS-scoped browser client; curriculum reads only, nothing is written
// to Supabase), saving it with `offline-store.ts`, asking the service worker
// to keep the pages that show it, and refreshing stale downloads quietly when
// the student is online.

let store: DownloadStore | null | undefined;

/** The IndexedDB download store, or null where there is none (the server, old browsers). */
export function downloadStore(): DownloadStore | null {
  if (store !== undefined) return store;
  if (typeof indexedDB === "undefined") return null;
  store = createDownloadStore(indexedDbBackend(indexedDB));
  return store;
}

// ---------------------------------------------------------------------------
// Reading chapters from Supabase.

const CHUNK = 100;
const chunks = <T>(items: T[]) =>
  Array.from({ length: Math.ceil(items.length / CHUNK) }, (_, i) =>
    items.slice(i * CHUNK, i * CHUNK + CHUNK),
  );

function must<T>(result: { data: T | null; error: { message: string } | null }): T | null {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

type ChapterRow = {
  id: string;
  title: string;
  summary_md: string | null;
  updated_at: string | null;
  display_order: number | null;
  subjects: { id: string; name: string; colour: string | null } | null;
};

export async function fetchChapterContent(
  chapterId: string,
  onFile?: (done: number, total: number) => void,
): Promise<{ content: ChapterContent; images: ChapterImage[] } | null> {
  const [chapterResult, cardsResult, diagramsResult] = await Promise.all([
    supabase
      .from("chapters")
      .select("id, title, summary_md, updated_at, display_order, subjects(id, name, colour)")
      .eq("id", chapterId)
      .maybeSingle(),
    supabase
      .from("flashcards")
      .select("id, front, back, hint")
      .eq("chapter_id", chapterId)
      .eq("status", "approved")
      .order("created_at", { ascending: true }),
    supabase
      .from("diagram_labels")
      .select("id, title, image_path, updated_at")
      .eq("chapter_id", chapterId)
      .eq("status", "approved")
      .order("display_order", { ascending: true }),
  ]);
  const chapter = must(chapterResult) as ChapterRow | null;
  const cards = must(cardsResult) ?? [];
  const diagrams = must(diagramsResult) ?? [];
  if (!chapter) return null;

  const content: ChapterContent = {
    chapterId: chapter.id,
    title: chapter.title,
    summaryMd: chapter.summary_md,
    displayOrder: chapter.display_order,
    updatedAt: chapter.updated_at,
    subject: chapter.subjects,
    flashcards: cards,
    diagrams: diagrams.map((d) => ({ id: d.id, title: d.title, imagePath: d.image_path })),
    version: contentVersion({
      updatedAt: chapter.updated_at,
      cardIds: cards.map((c) => c.id),
      diagrams: diagrams.map((d) => ({ id: d.id, updatedAt: d.updated_at })),
    }),
  };

  // The image files themselves, from the private diagrams bucket.
  const paths = chapterImagePaths(content);
  let done = 0;
  onFile?.(done, paths.length + 1);
  const images = await Promise.all(
    paths.map(async (path) => {
      const { data, error } = await supabase.storage.from("diagrams").download(path);
      if (error || !data) throw new Error(`Couldn't download image ${path}`);
      onFile?.(++done, paths.length + 1);
      return { path, blob: data };
    }),
  );
  onFile?.(paths.length + 1, paths.length + 1);
  return { content, images };
}

export const supabaseChapterSource: ChapterSource = {
  async versions(chapterIds) {
    const versions = new Map<string, string | null>();
    await Promise.all(
      chunks(chapterIds).map(async (ids) => {
        const [chapters, cards, diagrams] = await Promise.all([
          supabase.from("chapters").select("id, updated_at").in("id", ids).then(must),
          supabase
            .from("flashcards")
            .select("id, chapter_id")
            .in("chapter_id", ids)
            .eq("status", "approved")
            .then(must),
          supabase
            .from("diagram_labels")
            .select("id, chapter_id, updated_at")
            .in("chapter_id", ids)
            .eq("status", "approved")
            .then(must),
        ]);
        for (const id of ids) versions.set(id, null);
        for (const chapter of chapters ?? []) {
          versions.set(
            chapter.id,
            contentVersion({
              updatedAt: chapter.updated_at,
              cardIds: (cards ?? []).filter((c) => c.chapter_id === chapter.id).map((c) => c.id),
              diagrams: (diagrams ?? [])
                .filter((d) => d.chapter_id === chapter.id)
                .map((d) => ({ id: d.id, updatedAt: d.updated_at })),
            }),
          );
        }
      }),
    );
    return versions;
  },
  async subjectChapters(subjectIds) {
    const published = new Map<string, string[]>(subjectIds.map((id) => [id, []]));
    const rows =
      (await supabase
        .from("chapters")
        .select("id, subject_id")
        .in("subject_id", subjectIds)
        .eq("status", "published")
        .then(must)) ?? [];
    for (const row of rows) if (row.subject_id) published.get(row.subject_id)?.push(row.id);
    return published;
  },
  fetchChapter: (chapterId) => fetchChapterContent(chapterId),
};

// ---------------------------------------------------------------------------
// Storage space and the service worker.

let persistenceAsked = false;

/** Ask the browser not to clear downloads when space runs low (asked once). */
export async function requestPersistentStorage() {
  if (persistenceAsked || typeof navigator === "undefined") return;
  persistenceAsked = true;
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted?.())) {
      await navigator.storage.persist();
    }
  } catch {
    // Not supported: downloads still work, the browser may just clear them.
  }
}

/** How much Florence stores on this phone (downloads, pages, everything), if the browser says. */
export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (!estimate || estimate.usage == null) return null;
    return { usage: estimate.usage, quota: estimate.quota ?? 0 };
  } catch {
    return null;
  }
}

/** The pages a student opens to reach their downloads with no signal. */
export function offlinePageUrls(chapters: Pick<DownloadedChapterMeta, "chapterId" | "subject">[]) {
  const subjects = new Set(chapters.flatMap((c) => (c.subject ? [c.subject.id] : [])));
  return [
    "/home",
    "/subjects",
    "/profile",
    ...[...subjects].map((id) => `/subjects/${id}`),
    ...chapters.map((c) => `/chapters/${c.chapterId}`),
  ];
}

/**
 * Ask the service worker to keep these pages (and the scripts they load), so
 * they open when the app is started with no signal. Resolves false when
 * there is no service worker or it doesn't answer in time.
 */
export async function cachePagesForOffline(urls: string[], timeoutMs = 20_000) {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return false;
  try {
    // Just after the first page load the worker may not be registered yet:
    // give it a moment. Where there is none (previews), don't hold things up.
    const registered = Boolean(await navigator.serviceWorker.getRegistration());
    const ready = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), registered ? timeoutMs : 3000),
      ),
    ]);
    const worker = ready?.active;
    if (!worker) return false;
    return await new Promise<boolean>((resolve) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => resolve(false), timeoutMs);
      channel.port1.onmessage = (event) => {
        clearTimeout(timer);
        resolve(Boolean((event.data as { ok?: boolean } | null)?.ok));
      };
      worker.postMessage({ type: "florence:cache-pages", urls }, [channel.port2]);
    });
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Downloading.

export type DownloadProgress = { percent: number };

/**
 * Download chapters for this user, a few at a time. A subject passed along
 * is saved as downloaded whole, so chapters published later are added on
 * refresh. Throws if any chapter fails; the ones that finished stay saved.
 */
export async function downloadChapters(
  userId: string,
  chapterIds: string[],
  {
    subject,
    onProgress,
  }: { subject?: DownloadedSubjectInfo; onProgress?: (progress: DownloadProgress) => void } = {},
) {
  const downloads = downloadStore();
  if (!downloads) throw new Error("This browser can't keep downloads.");
  void requestPersistentStorage();

  // One chapter: progress by file (notes, then each image). Several: by chapter.
  const single = chapterIds.length === 1;
  let finished = 0;
  const report = (percent: number) => onProgress?.({ percent: Math.round(percent) });
  report(0);

  const queue = [...chapterIds];
  const saved: DownloadedChapterMeta[] = [];
  const worker = async () => {
    for (let id = queue.shift(); id; id = queue.shift()) {
      const fetched = await fetchChapterContent(
        id,
        single ? (done, total) => report((done / total) * 95) : undefined,
      );
      if (fetched) saved.push(await downloads.saveChapter(userId, fetched.content, fetched.images));
      finished++;
      if (!single) report((finished / chapterIds.length) * 95);
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, chapterIds.length) }, worker));
  if (subject) await downloads.saveSubject(userId, subject);

  // Keep the pages that show these chapters, so a cold start offline works.
  await cachePagesForOffline(offlinePageUrls(await downloads.listChapters(userId)));
  report(100);
  return saved;
}

export function removeChapterDownload(userId: string, chapterId: string) {
  return downloadStore()?.removeChapter(userId, chapterId);
}

export async function removeAllDownloads(userId: string | null) {
  if (userId) await downloadStore()?.removeAll(userId);
}

// ---------------------------------------------------------------------------
// React.

export type DownloadList = { chapters: DownloadedChapterMeta[]; subjects: DownloadedSubject[] };

/** The signed-in student's downloads. */
export function useDownloads() {
  const userId = useSessionUserId();
  return useQuery<DownloadList>({
    queryKey: ["downloads", userId],
    enabled: Boolean(userId),
    // IndexedDB, not the network: read it offline too.
    networkMode: "always",
    staleTime: Infinity,
    queryFn: async () => {
      const downloads = downloadStore();
      if (!downloads || !userId) return { chapters: [], subjects: [] };
      const [chapters, subjects] = await Promise.all([
        downloads.listChapters(userId),
        downloads.listSubjects(userId),
      ]);
      return { chapters, subjects };
    },
  });
}

export function invalidateDownloads(qc: QueryClient) {
  return qc.invalidateQueries({ queryKey: ["downloads"] });
}

export type DownloadState =
  { status: "idle" } | { status: "downloading"; percent: number } | { status: "error" };

/** Start a download from a button, with progress for that button. */
export function useDownloadAction() {
  const userId = useSessionUserId();
  const qc = useQueryClient();
  const [state, setState] = useState<DownloadState>({ status: "idle" });

  const start = useCallback(
    async (chapterIds: string[], subject?: DownloadedSubjectInfo) => {
      if (!userId || chapterIds.length === 0) return;
      setState({ status: "downloading", percent: 0 });
      try {
        await downloadChapters(userId, chapterIds, {
          subject,
          onProgress: ({ percent }) => setState({ status: "downloading", percent }),
        });
        setState({ status: "idle" });
      } catch (error) {
        console.error("Download failed", error);
        setState({ status: "error" });
      } finally {
        await invalidateDownloads(qc);
      }
    },
    [qc, userId],
  );

  return { state, start };
}

/**
 * While the student is online, refresh stale downloads quietly (at most
 * every few hours) and make sure the service worker still has their pages.
 */
export function useKeepDownloadsFresh() {
  const userId = useSessionUserId();
  const qc = useQueryClient();

  useEffect(() => {
    const downloads = downloadStore();
    if (!userId || !downloads) return;
    let running = false;
    const run = async () => {
      if (running || isOffline()) return;
      running = true;
      try {
        const result = await refreshDownloads(downloads, userId, supabaseChapterSource);
        const changed = [...result.refreshed, ...result.removed, ...result.added];
        if (changed.length) {
          await invalidateDownloads(qc);
          for (const chapterId of changed) {
            void qc.invalidateQueries({ queryKey: ["chapter-detail", chapterId] });
            void qc.invalidateQueries({ queryKey: ["chapter-flashcards", chapterId] });
          }
        }
        const chapters = await downloads.listChapters(userId);
        if (chapters.length) void cachePagesForOffline(offlinePageUrls(chapters));
      } catch (error) {
        console.warn("Couldn't refresh downloads", error);
      } finally {
        running = false;
      }
    };
    // After the screen's own reads, so it never slows the first paint.
    const timer = window.setTimeout(() => void run(), 4_000);
    const onOnline = () => void run();
    window.addEventListener("online", onOnline);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("online", onOnline);
    };
  }, [qc, userId]);
}

// ---------------------------------------------------------------------------
// Reading with a fallback to the download.

/** Offline (or the network failed) and this isn't downloaded. */
export class NotDownloadedError extends Error {
  constructor() {
    super("Not downloaded");
    this.name = "NotDownloadedError";
  }
}

/**
 * Read from the network, or from the download when the device is offline
 * or the request fails. With neither, the network error is thrown (offline:
 * `NotDownloadedError`).
 */
export async function readWithDownloadFallback<T>(
  network: () => Promise<T>,
  download: () => Promise<T | null>,
): Promise<T> {
  const local = () => download().catch(() => null);
  if (isOffline()) {
    const saved = await local();
    if (saved !== null) return saved;
    throw new NotDownloadedError();
  }
  try {
    return await network();
  } catch (error) {
    const saved = await local();
    if (saved !== null) return saved;
    throw isOffline() ? new NotDownloadedError() : error;
  }
}

/** Query options for reads that can come from a download. */
export const downloadFallbackQueryOptions = {
  // TanStack Query pauses queries while offline by default; these can still answer.
  networkMode: "always" as const,
  retry: (failures: number, error: unknown) =>
    !(error instanceof NotDownloadedError) && !isOffline() && failures < 2,
};

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}
