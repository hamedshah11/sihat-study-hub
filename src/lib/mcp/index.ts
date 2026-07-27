import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listSubjects from "./tools/list-subjects";
import listChapters from "./tools/list-chapters";
import getChapterNotes from "./tools/get-chapter-notes";
import listFlashcards from "./tools/list-flashcards";
import listQuestions from "./tools/list-questions";
import getMyProgress from "./tools/get-my-progress";

// On publish, SUPABASE_URL rewrites to the .lovable.cloud proxy which mcp-js rejects.
// Build the issuer from the inlined project ref so it survives publish.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "sihat-mcp",
  title: "Sihat Study Buddy",
  version: "0.1.0",
  instructions:
    "Tools for the Sihat nursing study app. Use `list_subjects` → `list_chapters` → `get_chapter_notes` / `list_flashcards` to read approved study material, and `get_my_progress` to check the signed-in student's XP and streak. All data is scoped to the signed-in user by row-level security.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listSubjects, listChapters, getChapterNotes, listFlashcards, listQuestions, getMyProgress],
});
