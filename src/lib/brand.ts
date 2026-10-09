// Florence brand constants (master brand book v2).

export const BRAND = {
  name: "Florence",
  storeName: "Florence: BSN Nursing Study",
  tagline: "Watch your knowledge bloom.",
  nightLine: "Study by lamplight.",
  productLine:
    "About ten minutes a day. Flashcards, MCQs and summaries for Semester 1, reviewed by SIHAT faculty.",
  tutorName: "Ask Florence",
} as const;

/**
 * The founding partner. SIHAT stays on every lockup ("Powered by SIHAT").
 * A partner college's own name is shown separately, in the course header.
 * SIHAT is said "sehat", like the Urdu word for health.
 */
export const FOUNDING_PARTNER = {
  short: "SIHAT",
  name: "Sindh Institute of Health and Technology",
  place: "Khairpur Mirs",
  display: "SIHAT, Khairpur Mirs",
} as const;

export const pageTitle = (title?: string) => (title ? `${title} · Florence` : BRAND.storeName);
