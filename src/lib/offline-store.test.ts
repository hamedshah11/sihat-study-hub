import { describe, expect, it } from "vitest";
import {
  CHECK_INTERVAL_MS,
  FULL_REFRESH_MS,
  chapterImagePaths,
  contentVersion,
  createDownloadStore,
  memoryBackend,
  planRefresh,
  refreshDownloads,
  type ChapterContent,
  type ChapterImage,
  type ChapterSource,
} from "./offline-store";

const ALICE = "11111111-1111-4111-8111-111111111111";
const BILAL = "22222222-2222-4222-8222-222222222222";
const SUBJECT = { id: "subject-micro", name: "Microbiology", colour: "mint" };
const now = new Date("2026-10-11T05:00:00Z");
const hoursLater = (h: number) => new Date(now.getTime() + h * 3_600_000);

function chapter(id: string, overrides: Partial<ChapterContent> = {}): ChapterContent {
  const base = {
    chapterId: id,
    title: `Chapter ${id}`,
    summaryMd: `## ${id}\n\nNotes for ${id}.\n\n![Chain](diagram://${id}/chain.png)`,
    displayOrder: 1,
    updatedAt: "2026-10-01T06:00:00.000Z",
    subject: SUBJECT,
    flashcards: [{ id: `${id}-card-1`, front: "Front", back: "Back", hint: null }],
    diagrams: [{ id: `${id}-diagram`, title: "Hand washing", imagePath: `${id}/hands.png` }],
    ...overrides,
  };
  return {
    ...base,
    version:
      overrides.version ??
      contentVersion({
        updatedAt: base.updatedAt,
        cardIds: base.flashcards.map((c) => c.id),
        diagrams: base.diagrams.map((d) => ({ id: d.id, updatedAt: null })),
      }),
  };
}

function imagesFor(content: ChapterContent): ChapterImage[] {
  return chapterImagePaths(content).map((path) => ({
    path,
    blob: new Blob([`image bytes for ${path}`], { type: "image/png" }),
  }));
}

function setup() {
  const backend = memoryBackend();
  return { backend, store: createDownloadStore(backend) };
}

describe("saving and reading downloads", () => {
  it("saves a chapter's notes, cards and image files, and reads them back", async () => {
    const { store } = setup();
    const content = chapter("ch1");
    const meta = await store.saveChapter(ALICE, content, imagesFor(content), now);

    expect(meta).toMatchObject({
      userId: ALICE,
      chapterId: "ch1",
      cardCount: 1,
      imagePaths: ["ch1/chain.png", "ch1/hands.png"],
      downloadedAt: now.toISOString(),
    });
    expect(meta.bytes).toBeGreaterThan(content.summaryMd!.length);

    const saved = await store.getChapter(ALICE, "ch1");
    expect(saved?.summaryMd).toBe(content.summaryMd);
    expect(saved?.flashcards).toEqual(content.flashcards);
    expect(saved?.diagrams).toEqual(content.diagrams);
    expect(saved?.updatedAt).toBe("2026-10-01T06:00:00.000Z");

    const image = await store.getImage(ALICE, "ch1", "ch1/hands.png");
    expect(await image?.text()).toBe("image bytes for ch1/hands.png");
  });

  it("lists a user's downloads in subject and teaching order", async () => {
    const { store } = setup();
    await store.saveChapter(ALICE, chapter("b", { displayOrder: 2 }), [], now);
    await store.saveChapter(ALICE, chapter("a", { displayOrder: 1 }), [], now);
    await store.saveChapter(
      ALICE,
      chapter("c", { subject: { id: "anat", name: "Anatomy", colour: "violet" } }),
      [],
      now,
    );
    expect((await store.listChapters(ALICE)).map((c) => c.chapterId)).toEqual(["c", "a", "b"]);
  });

  it("replaces a chapter whole and drops images the new version doesn't use", async () => {
    const { store } = setup();
    const first = chapter("ch1");
    await store.saveChapter(ALICE, first, imagesFor(first), now);
    const second = chapter("ch1", { summaryMd: "Rewritten notes, no pictures.", diagrams: [] });
    await store.saveChapter(ALICE, second, imagesFor(second), hoursLater(1));

    expect((await store.getChapter(ALICE, "ch1"))?.summaryMd).toBe("Rewritten notes, no pictures.");
    expect(await store.getImage(ALICE, "ch1", "ch1/hands.png")).toBeNull();
    expect(await store.listChapters(ALICE)).toHaveLength(1);
  });

  it("removes one chapter with its images", async () => {
    const { store, backend } = setup();
    const content = chapter("ch1");
    await store.saveChapter(ALICE, content, imagesFor(content), now);
    await store.saveChapter(ALICE, chapter("ch2"), [], now);
    await store.removeChapter(ALICE, "ch1");

    expect(await store.getChapter(ALICE, "ch1")).toBeNull();
    expect(await store.getChapter(ALICE, "ch2")).not.toBeNull();
    expect(await backend.keysForUser("images", ALICE)).toEqual([]);
  });

  it("stops treating a subject as downloaded whole once the student removes one of its chapters", async () => {
    const { store } = setup();
    await store.saveSubject(ALICE, SUBJECT, now);
    await store.saveChapter(ALICE, chapter("ch1"), [], now);
    await store.removeChapter(ALICE, "ch1");
    expect(await store.listSubjects(ALICE)).toEqual([]);
  });
});

describe("one account never sees another's downloads", () => {
  it("returns nothing to a second account on the same phone", async () => {
    const { store } = setup();
    const content = chapter("ch1");
    await store.saveChapter(ALICE, content, imagesFor(content), now);
    await store.saveSubject(ALICE, SUBJECT, now);

    // Alice never logged out; Bilal signs in on the same phone.
    expect(await store.getChapter(BILAL, "ch1")).toBeNull();
    expect(await store.getChapterMeta(BILAL, "ch1")).toBeNull();
    expect(await store.getImage(BILAL, "ch1", "ch1/hands.png")).toBeNull();
    expect(await store.listChapters(BILAL)).toEqual([]);
    expect(await store.listSubjects(BILAL)).toEqual([]);
  });

  it("refuses a stored row whose user id doesn't match, whatever its key says", async () => {
    const { store, backend } = setup();
    await backend.write([
      {
        put: "chapters",
        row: { key: `${BILAL}/ch1`, userId: ALICE, chapterId: "ch1", title: "Alice's" },
      },
      { put: "content", row: { key: `${BILAL}/ch1`, userId: ALICE, summaryMd: "Alice's notes" } },
      {
        put: "images",
        row: { key: `${BILAL}/ch1/a.png`, userId: ALICE, chapterId: "ch1", blob: new Blob(["x"]) },
      },
    ]);
    expect(await store.getChapter(BILAL, "ch1")).toBeNull();
    expect(await store.getImage(BILAL, "ch1", "a.png")).toBeNull();
    expect(await store.listChapters(BILAL)).toEqual([]);
  });

  it("returns nothing without a signed-in user", async () => {
    const { store } = setup();
    await store.saveChapter(ALICE, chapter("ch1"), [], now);
    expect(await store.getChapter("", "ch1")).toBeNull();
    expect(await store.listChapters("")).toEqual([]);
    await expect(store.saveChapter("", chapter("ch2"), [], now)).rejects.toThrow();
  });

  it("removes all of a user's downloads on log out and leaves other accounts alone", async () => {
    const { store, backend } = setup();
    const content = chapter("ch1");
    await store.saveChapter(ALICE, content, imagesFor(content), now);
    await store.saveChapter(ALICE, chapter("ch2"), [], now);
    await store.saveSubject(ALICE, SUBJECT, now);
    await store.saveChapter(BILAL, chapter("ch1"), [], now);

    await store.removeAll(ALICE);

    expect(await store.listChapters(ALICE)).toEqual([]);
    expect(await store.listSubjects(ALICE)).toEqual([]);
    for (const name of ["chapters", "content", "images", "subjects"] as const) {
      expect(await backend.keysForUser(name, ALICE)).toEqual([]);
    }
    expect((await store.listChapters(BILAL)).map((c) => c.chapterId)).toEqual(["ch1"]);
  });
});

describe("refreshing stale downloads", () => {
  function fakeSource(
    server: Map<string, ChapterContent>,
    published: Record<string, string[]> = {},
  ): ChapterSource & { fetched: string[]; asked: string[][] } {
    const fetched: string[] = [];
    const asked: string[][] = [];
    return {
      fetched,
      asked,
      async versions(ids) {
        asked.push(ids);
        return new Map(ids.map((id) => [id, server.get(id)?.version ?? null]));
      },
      async subjectChapters(subjectIds) {
        return new Map(subjectIds.map((id) => [id, published[id] ?? []]));
      },
      async fetchChapter(id) {
        fetched.push(id);
        const content = server.get(id);
        return content ? { content, images: imagesFor(content) } : null;
      },
    };
  }

  it("plans a refresh when the version changes or the download is a week old", () => {
    const downloads = [
      { chapterId: "same", version: "v1", downloadedAt: now.toISOString() },
      { chapterId: "edited", version: "v1", downloadedAt: now.toISOString() },
      { chapterId: "gone", version: "v1", downloadedAt: now.toISOString() },
      {
        chapterId: "old",
        version: "v1",
        downloadedAt: new Date(now.getTime() - FULL_REFRESH_MS).toISOString(),
      },
    ];
    const versions = new Map<string, string | null>([
      ["same", "v1"],
      ["edited", "v2"],
      ["gone", null],
      ["old", "v1"],
    ]);
    expect(planRefresh(downloads, versions, now)).toEqual({
      refresh: ["edited", "old"],
      remove: ["gone"],
      unchanged: ["same"],
    });
  });

  it("downloads edited chapters again, quietly, and keeps the rest", async () => {
    const { store } = setup();
    const original = chapter("ch1");
    const untouched = chapter("ch2");
    await store.saveChapter(ALICE, original, imagesFor(original), now);
    await store.saveChapter(ALICE, untouched, [], now);

    // Faculty edit the notes: the chapter's last-updated time moves on.
    const edited = chapter("ch1", {
      summaryMd: "Updated notes.",
      updatedAt: "2026-10-11T08:00:00.000Z",
      diagrams: [],
    });
    const server = new Map([
      ["ch1", edited],
      ["ch2", untouched],
    ]);
    const source = fakeSource(server);
    const later = hoursLater(7);

    const result = await refreshDownloads(store, ALICE, source, { now: later });

    expect(result).toEqual({ refreshed: ["ch1"], removed: [], added: [] });
    expect(source.fetched).toEqual(["ch1"]);
    const saved = await store.getChapter(ALICE, "ch1");
    expect(saved?.summaryMd).toBe("Updated notes.");
    expect(saved?.updatedAt).toBe("2026-10-11T08:00:00.000Z");
    expect(await store.getImage(ALICE, "ch1", "ch1/hands.png")).toBeNull();
    expect((await store.getChapterMeta(ALICE, "ch2"))?.checkedAt).toBe(later.toISOString());
  });

  it("notices newly approved cards even when the notes didn't change", async () => {
    const { store } = setup();
    await store.saveChapter(ALICE, chapter("ch1"), [], now);
    const moreCards = chapter("ch1", {
      flashcards: [
        { id: "ch1-card-1", front: "Front", back: "Back", hint: null },
        { id: "ch1-card-2", front: "New", back: "Card", hint: "A hint" },
      ],
    });
    await refreshDownloads(store, ALICE, fakeSource(new Map([["ch1", moreCards]])), {
      now: hoursLater(7),
    });
    expect((await store.getChapter(ALICE, "ch1"))?.flashcards).toHaveLength(2);
  });

  it("asks the server at most every few hours unless forced", async () => {
    const { store } = setup();
    await store.saveChapter(ALICE, chapter("ch1"), [], now);
    const source = fakeSource(new Map([["ch1", chapter("ch1")]]));

    await refreshDownloads(store, ALICE, source, { now: hoursLater(1) });
    expect(source.asked).toEqual([]);

    await refreshDownloads(store, ALICE, source, {
      now: new Date(now.getTime() + CHECK_INTERVAL_MS),
    });
    expect(source.asked).toEqual([["ch1"]]);
    expect(source.fetched).toEqual([]);

    await refreshDownloads(store, ALICE, source, { now: hoursLater(7), force: true });
    expect(source.asked).toHaveLength(2);
  });

  it("removes chapters that were unpublished and adds new ones to a subject downloaded whole", async () => {
    const { store } = setup();
    await store.saveSubject(ALICE, SUBJECT, now);
    await store.saveChapter(ALICE, chapter("ch1"), [], now);
    await store.saveChapter(ALICE, chapter("ch2"), [], now);
    const server = new Map([
      ["ch1", chapter("ch1")],
      ["ch3", chapter("ch3", { displayOrder: 3 })],
    ]);
    const source = fakeSource(server, { [SUBJECT.id]: ["ch1", "ch3"] });

    const result = await refreshDownloads(store, ALICE, source, { now: hoursLater(7) });

    expect(result).toEqual({ refreshed: [], removed: ["ch2"], added: ["ch3"] });
    expect((await store.listChapters(ALICE)).map((c) => c.chapterId)).toEqual(["ch1", "ch3"]);
    // The subject is still downloaded whole.
    expect(await store.listSubjects(ALICE)).toHaveLength(1);
  });

  it("keeps the old copy when a chapter fails to download again", async () => {
    const { store } = setup();
    await store.saveChapter(ALICE, chapter("ch1"), [], now);
    const source: ChapterSource = {
      versions: async () => new Map([["ch1", "something newer"]]),
      subjectChapters: async () => new Map(),
      fetchChapter: async () => {
        throw new Error("Failed to fetch");
      },
    };
    const warn = console.warn;
    console.warn = () => {};
    try {
      const result = await refreshDownloads(store, ALICE, source, { now: hoursLater(7) });
      expect(result.refreshed).toEqual([]);
    } finally {
      console.warn = warn;
    }
    expect((await store.getChapter(ALICE, "ch1"))?.summaryMd).toContain("Notes for ch1");
  });

  it("only ever touches the signed-in user's downloads", async () => {
    const { store } = setup();
    await store.saveChapter(ALICE, chapter("ch1"), [], now);
    await store.saveChapter(BILAL, chapter("ch1"), [], now);
    const edited = chapter("ch1", { updatedAt: "2026-10-11T08:00:00.000Z", summaryMd: "New" });
    await refreshDownloads(store, BILAL, fakeSource(new Map([["ch1", edited]])), {
      now: hoursLater(7),
    });
    expect((await store.getChapter(BILAL, "ch1"))?.summaryMd).toBe("New");
    expect((await store.getChapter(ALICE, "ch1"))?.summaryMd).toContain("Notes for ch1");
  });
});
