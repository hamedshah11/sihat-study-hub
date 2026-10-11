// Offline downloads: a chapter's notes, approved flashcards and diagram
// images, saved in this browser's IndexedDB so they open with no signal.
//
// Everything is keyed by the signed-in user's id, and every read checks the
// stored user id again before returning a row, so one account never sees
// another account's downloads on a shared phone, even if the first one never
// logged out. Nothing here talks to Supabase: the network side lives in
// `downloads.ts`, and the refresh rules take the network as a parameter so
// they can be tested with a fake one.
//
// The service worker never caches Supabase REST responses (see public/sw.js);
// these explicit, account-scoped downloads are the only offline copy of
// curriculum data.

export type DownloadedCard = { id: string; front: string; back: string; hint: string | null };
export type DownloadedDiagram = { id: string; title: string; imagePath: string };
export type DownloadedSubjectInfo = { id: string; name: string; colour: string | null };

/** What the chapter page shows, as read from Supabase. */
export type ChapterContent = {
  chapterId: string;
  title: string;
  summaryMd: string | null;
  displayOrder: number | null;
  /** `chapters.updated_at` when it was downloaded. */
  updatedAt: string | null;
  subject: DownloadedSubjectInfo | null;
  flashcards: DownloadedCard[];
  diagrams: DownloadedDiagram[];
  /** See `contentVersion`: changes when the notes, cards or diagrams change. */
  version: string;
};

export type ChapterImage = { path: string; blob: Blob };

/** The light part of a download: enough for lists, chips and sizes. */
export type DownloadedChapterMeta = {
  userId: string;
  chapterId: string;
  title: string;
  displayOrder: number | null;
  updatedAt: string | null;
  subject: DownloadedSubjectInfo | null;
  version: string;
  cardCount: number;
  imagePaths: string[];
  /** Notes, cards and images together. */
  bytes: number;
  downloadedAt: string;
  /** Last time the server was asked whether this chapter changed. */
  checkedAt: string;
};

export type DownloadedChapter = DownloadedChapterMeta & {
  summaryMd: string | null;
  flashcards: DownloadedCard[];
  diagrams: DownloadedDiagram[];
};

/** A subject downloaded whole: chapters published later are added on refresh. */
export type DownloadedSubject = DownloadedSubjectInfo & {
  userId: string;
  downloadedAt: string;
};

// ---------------------------------------------------------------------------
// Storage backend: IndexedDB in the browser, a Map in unit tests.

export const STORES = ["chapters", "content", "images", "subjects"] as const;
export type StoreName = (typeof STORES)[number];

type Row = { key: string; userId: string; [field: string]: unknown };
export type WriteOp = { put: StoreName; row: Row } | { delete: StoreName; key: string };

export interface DownloadBackend {
  get(store: StoreName, key: string): Promise<Row | undefined>;
  listForUser(store: StoreName, userId: string): Promise<Row[]>;
  keysForUser(store: StoreName, userId: string): Promise<string[]>;
  /** Applied in one transaction: a chapter is saved whole or not at all. */
  write(ops: WriteOp[]): Promise<void>;
}

const DB_NAME = "florence-downloads";
const DB_VERSION = 1;

function promised<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function indexedDbBackend(factory: IDBFactory): DownloadBackend {
  let opening: Promise<IDBDatabase> | null = null;
  const open = () =>
    (opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const name of STORES) {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, { keyPath: "key" }).createIndex("userId", "userId");
          }
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        // Another tab is upgrading the database: let it, and reopen next time.
        db.onversionchange = () => {
          db.close();
          opening = null;
        };
        resolve(db);
      };
      request.onerror = () => {
        opening = null;
        reject(request.error);
      };
    }));

  return {
    async get(store, key) {
      const db = await open();
      return promised(db.transaction(store).objectStore(store).get(key)) as Promise<
        Row | undefined
      >;
    },
    async listForUser(store, userId) {
      const db = await open();
      const index = db.transaction(store).objectStore(store).index("userId");
      return promised(index.getAll(IDBKeyRange.only(userId))) as Promise<Row[]>;
    },
    async keysForUser(store, userId) {
      const db = await open();
      const index = db.transaction(store).objectStore(store).index("userId");
      return (await promised(index.getAllKeys(IDBKeyRange.only(userId)))) as string[];
    },
    async write(ops) {
      if (ops.length === 0) return;
      const db = await open();
      const names = [...new Set(ops.map((op) => ("put" in op ? op.put : op.delete)))];
      const tx = db.transaction(names, "readwrite");
      for (const op of ops) {
        if ("put" in op) tx.objectStore(op.put).put(op.row);
        else tx.objectStore(op.delete).delete(op.key);
      }
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error("Download storage was interrupted."));
      });
    },
  };
}

/** The same behaviour as IndexedDB, in memory, for unit tests. */
export function memoryBackend(): DownloadBackend {
  const stores = new Map<StoreName, Map<string, Row>>(STORES.map((name) => [name, new Map()]));
  return {
    async get(store, key) {
      return stores.get(store)!.get(key);
    },
    async listForUser(store, userId) {
      return [...stores.get(store)!.values()].filter((row) => row.userId === userId);
    },
    async keysForUser(store, userId) {
      return [...stores.get(store)!.values()]
        .filter((row) => row.userId === userId)
        .map((row) => row.key);
    },
    async write(ops) {
      for (const op of ops) {
        if ("put" in op) stores.get(op.put)!.set(op.row.key, structuredClone(op.row));
        else stores.get(op.delete)!.delete(op.key);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// The download store.

const chapterKey = (userId: string, chapterId: string) => `${userId}/${chapterId}`;
const imageKey = (userId: string, chapterId: string, path: string) =>
  `${userId}/${chapterId}/${path}`;

/** Only a row that belongs to this user is ever returned. */
function owned<T extends Row>(row: Row | undefined, userId: string): T | null {
  return row && row.userId === userId ? (row as T) : null;
}

function strip<T extends Row>(row: T): Omit<T, "key"> {
  const { key: _key, ...rest } = row;
  return rest;
}

const textBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

/**
 * A fingerprint of what a download holds. The chapter's last-updated time
 * changes when its notes are edited; approving, rejecting or retiring a card
 * or diagram changes the ids. Card text edits don't touch either, which is
 * why downloads are also refreshed in full once a week (`FULL_REFRESH_MS`).
 */
export function contentVersion(input: {
  updatedAt: string | null;
  cardIds: string[];
  diagrams: { id: string; updatedAt: string | null }[];
}): string {
  const cards = [...input.cardIds].sort().join(",");
  const diagrams = input.diagrams
    .map((d) => `${d.id}@${d.updatedAt ?? ""}`)
    .sort()
    .join(",");
  return `${input.updatedAt ?? ""}|${cards}|${diagrams}`;
}

/** `diagram://path` images written into the notes. */
export function embeddedImagePaths(summaryMd: string | null): string[] {
  return Array.from(summaryMd?.matchAll(/diagram:\/\/([^\s)]+)/g) ?? [], (match) => match[1]);
}

/** Every image the chapter page shows: in the notes and as figures below them. */
export function chapterImagePaths(content: Pick<ChapterContent, "summaryMd" | "diagrams">) {
  return [
    ...new Set([
      ...embeddedImagePaths(content.summaryMd),
      ...content.diagrams.map((d) => d.imagePath),
    ]),
  ];
}

export type DownloadStore = ReturnType<typeof createDownloadStore>;

export function createDownloadStore(backend: DownloadBackend) {
  async function getChapterMeta(userId: string, chapterId: string) {
    if (!userId) return null;
    const row = owned(await backend.get("chapters", chapterKey(userId, chapterId)), userId);
    return row ? (strip(row) as unknown as DownloadedChapterMeta) : null;
  }

  /**
   * Save (or replace) a chapter with its images in one transaction. Images
   * the new version no longer uses are deleted with it.
   */
  async function saveChapter(
    userId: string,
    content: ChapterContent,
    images: ChapterImage[],
    now = new Date(),
  ): Promise<DownloadedChapterMeta> {
    if (!userId) throw new Error("Downloads need a signed-in student.");
    const previous = await getChapterMeta(userId, content.chapterId);
    const imagePaths = images.map((image) => image.path);
    const { chapterId, summaryMd, flashcards, diagrams, ...rest } = content;
    const body = { summaryMd, flashcards, diagrams };
    const meta: DownloadedChapterMeta = {
      ...rest,
      userId,
      chapterId,
      cardCount: flashcards.length,
      imagePaths,
      bytes: textBytes(body) + images.reduce((sum, image) => sum + image.blob.size, 0),
      downloadedAt: now.toISOString(),
      checkedAt: now.toISOString(),
    };
    const key = chapterKey(userId, chapterId);
    await backend.write([
      ...(previous?.imagePaths ?? [])
        .filter((path) => !imagePaths.includes(path))
        .map((path) => ({ delete: "images" as const, key: imageKey(userId, chapterId, path) })),
      ...images.map((image) => ({
        put: "images" as const,
        row: {
          key: imageKey(userId, chapterId, image.path),
          userId,
          chapterId,
          path: image.path,
          blob: image.blob,
        },
      })),
      { put: "content", row: { key, userId, chapterId, ...body } },
      { put: "chapters", row: { key, ...meta } },
    ]);
    return meta;
  }

  async function getChapter(userId: string, chapterId: string): Promise<DownloadedChapter | null> {
    if (!userId) return null;
    const [meta, content] = await Promise.all([
      getChapterMeta(userId, chapterId),
      backend.get("content", chapterKey(userId, chapterId)).then((row) => owned(row, userId)),
    ]);
    if (!meta || !content) return null;
    return {
      ...meta,
      summaryMd: (content.summaryMd as string | null) ?? null,
      flashcards: (content.flashcards as DownloadedCard[]) ?? [],
      diagrams: (content.diagrams as DownloadedDiagram[]) ?? [],
    };
  }

  async function getImage(userId: string, chapterId: string, path: string): Promise<Blob | null> {
    if (!userId) return null;
    const row = owned(await backend.get("images", imageKey(userId, chapterId, path)), userId);
    return row && row.chapterId === chapterId ? (row.blob as Blob) : null;
  }

  /** The user's downloads, in subject then teaching order. */
  async function listChapters(userId: string): Promise<DownloadedChapterMeta[]> {
    if (!userId) return [];
    const rows = await backend.listForUser("chapters", userId);
    return rows
      .filter((row) => row.userId === userId)
      .map((row) => strip(row) as unknown as DownloadedChapterMeta)
      .sort(
        (a, b) =>
          (a.subject?.name ?? "").localeCompare(b.subject?.name ?? "") ||
          (a.displayOrder ?? 0) - (b.displayOrder ?? 0) ||
          a.title.localeCompare(b.title),
      );
  }

  async function markChecked(userId: string, chapterIds: string[], now = new Date()) {
    const metas = await Promise.all(chapterIds.map((id) => getChapterMeta(userId, id)));
    await backend.write(
      metas
        .filter((meta): meta is DownloadedChapterMeta => meta !== null)
        .map((meta) => ({
          put: "chapters" as const,
          row: { key: chapterKey(userId, meta.chapterId), ...meta, checkedAt: now.toISOString() },
        })),
    );
  }

  /**
   * Remove one chapter. When the student removes it themselves, its subject
   * stops counting as downloaded whole, so a refresh won't bring it back;
   * `keepSubject` is for chapters the server unpublished.
   */
  async function removeChapter(
    userId: string,
    chapterId: string,
    { keepSubject = false }: { keepSubject?: boolean } = {},
  ) {
    const meta = await getChapterMeta(userId, chapterId);
    if (!meta) return;
    const key = chapterKey(userId, chapterId);
    await backend.write([
      ...meta.imagePaths.map((path) => ({
        delete: "images" as const,
        key: imageKey(userId, chapterId, path),
      })),
      { delete: "content", key },
      { delete: "chapters", key },
      ...(meta.subject && !keepSubject
        ? [{ delete: "subjects" as const, key: chapterKey(userId, meta.subject.id) }]
        : []),
    ]);
  }

  /** Everything this user downloaded, on log out or from Settings. */
  async function removeAll(userId: string) {
    if (!userId) return;
    const keys = await Promise.all(
      STORES.map(async (store) => ({ store, keys: await backend.keysForUser(store, userId) })),
    );
    await backend.write(
      keys.flatMap(({ store, keys }) => keys.map((key) => ({ delete: store, key }))),
    );
  }

  async function saveSubject(userId: string, subject: DownloadedSubjectInfo, now = new Date()) {
    if (!userId) throw new Error("Downloads need a signed-in student.");
    const row: DownloadedSubject = { ...subject, userId, downloadedAt: now.toISOString() };
    await backend.write([
      { put: "subjects", row: { key: chapterKey(userId, subject.id), ...row } },
    ]);
  }

  async function listSubjects(userId: string): Promise<DownloadedSubject[]> {
    if (!userId) return [];
    const rows = await backend.listForUser("subjects", userId);
    return rows
      .filter((row) => row.userId === userId)
      .map((row) => strip(row) as unknown as DownloadedSubject);
  }

  /** A whole subject: every downloaded chapter in it, and the subject itself. */
  async function removeSubject(userId: string, subjectId: string) {
    const chapters = (await listChapters(userId)).filter((c) => c.subject?.id === subjectId);
    for (const chapter of chapters) await removeChapter(userId, chapter.chapterId);
    await backend.write([{ delete: "subjects", key: chapterKey(userId, subjectId) }]);
  }

  return {
    saveChapter,
    getChapterMeta,
    getChapter,
    getImage,
    listChapters,
    markChecked,
    removeChapter,
    removeAll,
    saveSubject,
    listSubjects,
    removeSubject,
  };
}

// ---------------------------------------------------------------------------
// Refreshing stale downloads.

/** The network side of a refresh (Supabase in the app, a fake in tests). */
export type ChapterSource = {
  /** Each chapter's current `contentVersion`; missing or null when it's no longer available. */
  versions(chapterIds: string[]): Promise<Map<string, string | null>>;
  /** Chapter ids currently published in each subject. */
  subjectChapters(subjectIds: string[]): Promise<Map<string, string[]>>;
  fetchChapter(
    chapterId: string,
  ): Promise<{ content: ChapterContent; images: ChapterImage[] } | null>;
};

/** Ask the server at most this often. */
export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** Download again in full after this long, to pick up card text edits. */
export const FULL_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;

export type RefreshPlan = { refresh: string[]; remove: string[]; unchanged: string[] };

/** Which downloads to fetch again, remove (unpublished) or just mark as checked. */
export function planRefresh(
  downloads: Pick<DownloadedChapterMeta, "chapterId" | "version" | "downloadedAt">[],
  versions: Map<string, string | null>,
  now = new Date(),
): RefreshPlan {
  const plan: RefreshPlan = { refresh: [], remove: [], unchanged: [] };
  for (const download of downloads) {
    const current = versions.get(download.chapterId);
    if (current == null) plan.remove.push(download.chapterId);
    else if (
      current !== download.version ||
      now.getTime() - Date.parse(download.downloadedAt) >= FULL_REFRESH_MS
    )
      plan.refresh.push(download.chapterId);
    else plan.unchanged.push(download.chapterId);
  }
  return plan;
}

export type RefreshResult = { refreshed: string[]; removed: string[]; added: string[] };

/**
 * Bring this user's downloads up to date: changed chapters are downloaded
 * again, unpublished ones removed, and chapters newly published in a subject
 * that was downloaded whole are added. Quiet by design: a chapter that fails
 * to download keeps its old copy and is tried again next time.
 */
export async function refreshDownloads(
  store: DownloadStore,
  userId: string,
  source: ChapterSource,
  { now = new Date(), force = false }: { now?: Date; force?: boolean } = {},
): Promise<RefreshResult> {
  const result: RefreshResult = { refreshed: [], removed: [], added: [] };
  if (!userId) return result;

  const downloads = await store.listChapters(userId);
  const due = force
    ? downloads
    : downloads.filter((d) => now.getTime() - Date.parse(d.checkedAt) >= CHECK_INTERVAL_MS);
  // Whole subjects are checked for new chapters along with the periodic check.
  const subjects = due.length > 0 || force ? await store.listSubjects(userId) : [];
  if (due.length === 0 && subjects.length === 0) return result;

  const [versions, published] = await Promise.all([
    due.length ? source.versions(due.map((d) => d.chapterId)) : new Map<string, string | null>(),
    subjects.length
      ? source.subjectChapters(subjects.map((s) => s.id))
      : new Map<string, string[]>(),
  ]);

  const plan = planRefresh(due, versions, now);
  for (const chapterId of plan.remove) {
    await store.removeChapter(userId, chapterId, { keepSubject: true });
    result.removed.push(chapterId);
  }

  const have = new Set(downloads.map((d) => d.chapterId).filter((id) => !plan.remove.includes(id)));
  const added = [...new Set([...published.values()].flat())].filter((id) => !have.has(id));

  for (const chapterId of [...plan.refresh, ...added]) {
    try {
      const fetched = await source.fetchChapter(chapterId);
      if (!fetched) continue;
      await store.saveChapter(userId, fetched.content, fetched.images, now);
      (plan.refresh.includes(chapterId) ? result.refreshed : result.added).push(chapterId);
    } catch (error) {
      console.warn("Couldn't refresh a downloaded chapter", chapterId, error);
    }
  }
  await store.markChecked(userId, plan.unchanged, now);
  return result;
}
