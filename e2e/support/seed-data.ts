// The fixed curriculum and accounts the end-to-end tests run against. Ids are
// fixed so tests can refer to rows directly, and the seed can be re-run to
// put everything back as it was.

/** A fixed, valid v4-style UUID: e2e0000K-0000-4000-8000-00000000000N. */
export function fixedId(kind: number, n: number) {
  return `e2e${String(kind).padStart(5, "0")}-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

export const IDS = {
  programme: fixedId(1, 1),
  semester1: fixedId(2, 1),
  semester2: fixedId(2, 2),
  /** The batch students join with BATCH_CODE. */
  batchA: fixedId(3, 1),
  /** A batch nobody joins during the tests, so its screenshots stay the same. */
  batchB: fixedId(3, 2),
  fundamentals: fixedId(4, 1),
  microbiology: fixedId(4, 2),
  /** Semester 2: where the faculty test makes (and publishes) its own chapters. */
  communityHealth: fixedId(4, 3),
  vitalSigns: fixedId(5, 1),
  woundCare: fixedId(5, 2),
  sterilisation: fixedId(5, 3),
  handHygiene: fixedId(5, 4),
  student: fixedId(8, 1),
  screenshotStudent: fixedId(8, 2),
  faculty: fixedId(8, 3),
} as const;

export const BATCH_CODE = "E2E26-BSN1";
export const BATCH_B_CODE = "E2E26-BSN2";

export const PASSWORD = "florence-e2e-password";

export const ACCOUNTS = {
  student: {
    id: IDS.student,
    name: "Sana Baloch",
    email: "sana@florence.test",
    /** Gets the test SMS code in supabase/config.toml. */
    phone: "+923000000001",
    phoneTyped: "0300 0000001",
    batch: IDS.batchA,
    role: "student",
  },
  screenshotStudent: {
    id: IDS.screenshotStudent,
    name: "Ayesha Memon",
    email: "ayesha@florence.test",
    phone: null,
    phoneTyped: null,
    batch: IDS.batchB,
    role: "student",
  },
  faculty: {
    id: IDS.faculty,
    name: "Nadia Shaikh",
    email: "faculty@florence.test",
    phone: null,
    phoneTyped: null,
    batch: null,
    role: "instructor",
  },
} as const;

/** The SMS code supabase/config.toml gives the student's phone number. */
export const TEST_SMS_CODE = "246810";

export type SeedQuestion = {
  prompt: string;
  options: string[];
  correct: number;
  explanation: string;
  status?: "approved" | "draft";
};

export type SeedCard = {
  front: string;
  back: string;
  hint?: string;
  status?: "approved" | "draft";
};

export type SeedChapter = {
  id: string;
  subjectId: string;
  title: string;
  order: number;
  status: "published" | "draft";
  notes: string;
  questions: SeedQuestion[];
  cards: SeedCard[];
};

const VITAL_SIGNS_NOTES = `## Why vital signs matter

Vital signs show how well the body's basic functions are working. Measure them on admission, before and after procedures, and whenever a patient's condition changes. Always compare a reading with the patient's earlier readings, not just the normal range.

## Temperature

A normal adult temperature is 36.5 to 37.5 °C. Use the same route each time so readings can be compared. An oral reading is not suitable for an unconscious or confused patient.

## Pulse

A normal adult resting pulse is 60 to 100 beats a minute. Count the radial pulse for 30 seconds and double it if it is regular; count for a full minute if it is irregular. Note the rate, rhythm and volume.

## Respiration

A normal adult breathes 12 to 20 times a minute. Count breathing without telling the patient, because people breathe differently when they know they are being watched.

## Blood pressure

Use a cuff that fits: a cuff that is too small gives a falsely high reading. Support the arm at heart level and let the patient rest for five minutes first. Record both numbers, for example 120/80 mmHg.

## Recording and reporting

Record each reading straight away on the observation chart. Report any reading outside the expected range, or any sudden change, to the nurse in charge.
`;

export const VITAL_SIGNS_QUESTIONS: SeedQuestion[] = [
  {
    prompt: "What is a normal adult resting pulse?",
    options: [
      "40 to 60 beats a minute",
      "60 to 100 beats a minute",
      "100 to 140 beats a minute",
      "140 to 160 beats a minute",
    ],
    correct: 1,
    explanation: "A normal adult resting pulse is 60 to 100 beats a minute.",
  },
  {
    prompt: "How many times a minute does a healthy adult normally breathe?",
    options: ["6 to 10", "12 to 20", "22 to 30", "30 to 40"],
    correct: 1,
    explanation: "A normal adult breathes 12 to 20 times a minute.",
  },
  {
    prompt: "What is a normal adult temperature?",
    options: ["35.0 to 35.9 °C", "36.5 to 37.5 °C", "38.0 to 38.5 °C", "39.0 to 40.0 °C"],
    correct: 1,
    explanation: "A normal adult temperature is 36.5 to 37.5 °C.",
  },
  {
    prompt: "How long should you count an irregular pulse?",
    options: ["15 seconds", "30 seconds", "A full minute", "Two minutes"],
    correct: 2,
    explanation: "Count an irregular pulse for a full minute to get an accurate rate.",
  },
  {
    prompt: "What does a blood pressure cuff that is too small do to the reading?",
    options: ["Makes it falsely high", "Makes it falsely low", "Nothing", "Stops the reading"],
    correct: 0,
    explanation: "A cuff that is too small gives a falsely high reading.",
  },
  {
    prompt: "How long should a patient rest before you measure blood pressure?",
    options: ["No rest is needed", "One minute", "Five minutes", "Thirty minutes"],
    correct: 2,
    explanation: "Let the patient rest for five minutes first.",
  },
  {
    prompt: "Why do you count breathing without telling the patient?",
    options: [
      "It saves time",
      "People breathe differently when watched",
      "It is more polite",
      "The chart asks for it",
    ],
    correct: 1,
    explanation: "People breathe differently when they know they are being watched.",
  },
  {
    prompt: "Which temperature route is not suitable for an unconscious patient?",
    options: ["Oral", "Axillary", "Tympanic", "Temporal"],
    correct: 0,
    explanation: "An oral reading is not suitable for an unconscious or confused patient.",
  },
  {
    prompt: "Where should the arm be during a blood pressure reading?",
    options: [
      "Above the head",
      "Supported at heart level",
      "Hanging by the side",
      "Across the chest",
    ],
    correct: 1,
    explanation: "Support the arm at heart level.",
  },
  {
    prompt: "You count a regular pulse for 30 seconds. What next?",
    options: ["Halve it", "Double it", "Triple it", "Record it as it is"],
    correct: 1,
    explanation: "Count a regular pulse for 30 seconds and double it.",
  },
  {
    prompt: "What should you compare a new reading with first?",
    options: [
      "A textbook chart",
      "The patient's earlier readings",
      "Another patient's readings",
      "Nothing",
    ],
    correct: 1,
    explanation: "Always compare a reading with the patient's earlier readings.",
  },
  {
    prompt: "When should you record a vital sign?",
    options: [
      "At the end of the shift",
      "Straight away",
      "Only if it is abnormal",
      "The next morning",
    ],
    correct: 1,
    explanation: "Record each reading straight away on the observation chart.",
  },
  {
    prompt: "Who do you tell about a sudden change in vital signs?",
    options: ["Nobody", "The patient's family", "The nurse in charge", "The pharmacist"],
    correct: 2,
    explanation: "Report any sudden change to the nurse in charge.",
  },
  {
    prompt: "Which three things do you note about a pulse?",
    options: [
      "Rate, rhythm and volume",
      "Colour, size and shape",
      "Sound, speed and smell",
      "Depth, width and length",
    ],
    correct: 0,
    explanation: "Note the rate, rhythm and volume of the pulse.",
  },
  {
    prompt: "How do you record a blood pressure?",
    options: [
      "Only the top number",
      "Only the bottom number",
      "Both numbers, for example 120/80 mmHg",
      "As high, normal or low",
    ],
    correct: 2,
    explanation: "Record both numbers, for example 120/80 mmHg.",
  },
];

export const VITAL_SIGNS_CARDS: SeedCard[] = [
  { front: "What is a normal adult resting pulse?", back: "60 to 100 beats a minute." },
  {
    front: "How many times a minute does a healthy adult breathe?",
    back: "12 to 20 times a minute.",
  },
  { front: "What is a normal adult temperature?", back: "36.5 to 37.5 °C." },
  {
    front: "How long do you count an irregular pulse?",
    back: "A full minute.",
    hint: "Longer than a regular one.",
  },
  {
    front: "How can you count a regular pulse quickly?",
    back: "Count for 30 seconds and double it.",
  },
  { front: "Which three things do you note about a pulse?", back: "Rate, rhythm and volume." },
  {
    front: "What does a cuff that is too small do to a blood pressure reading?",
    back: "It makes the reading falsely high.",
  },
  {
    front: "How long should a patient rest before a blood pressure reading?",
    back: "Five minutes.",
  },
  {
    front: "Where should the arm be for a blood pressure reading?",
    back: "Supported at heart level.",
  },
  {
    front: "Why count breathing without telling the patient?",
    back: "People breathe differently when they know they are being watched.",
  },
  {
    front: "When are vital signs measured?",
    back: "On admission, before and after procedures, and whenever the patient's condition changes.",
  },
  { front: "Which temperature route is not suitable for an unconscious patient?", back: "Oral." },
  {
    front: "Why use the same temperature route each time?",
    back: "So the readings can be compared.",
  },
  { front: "Where do you record vital signs?", back: "On the observation chart, straight away." },
  {
    front: "Which readings do you report?",
    back: "Any reading outside the expected range, and any sudden change.",
  },
  { front: "Who do you report a change in vital signs to?", back: "The nurse in charge." },
  { front: "Which pulse is usually counted?", back: "The radial pulse, at the wrist." },
  { front: "Which unit is blood pressure measured in?", back: "mmHg, millimetres of mercury." },
  {
    front: "In 120/80 mmHg, which number is the systolic pressure?",
    back: "120, the first number.",
  },
  { front: "What do vital signs show?", back: "How well the body's basic functions are working." },
  {
    front: "What do you compare a new reading with first?",
    back: "The patient's own earlier readings.",
  },
  {
    front: "A resting adult has a pulse of 120. What does that mean?",
    back: "It is faster than normal. Report it to the nurse in charge.",
  },
  {
    front: "A resting adult breathes 8 times a minute. What does that mean?",
    back: "It is slower than normal. Report it to the nurse in charge.",
  },
  {
    front: "An adult's temperature is 38.2 °C. What does that mean?",
    back: "It is above the normal range. Report it to the nurse in charge.",
  },
  {
    front: "Which numbers do you record for blood pressure?",
    back: "Both numbers, for example 120/80 mmHg.",
  },
];

const WOUND_CARE_NOTES = `## Assessing a wound

Look at the size, the depth, the colour of the wound bed, any discharge and the skin around it. Record what you see each time the dressing is changed.

## Signs of infection

Redness spreading from the wound, swelling, heat, increasing pain, pus or a bad smell can mean infection. Report them to the nurse in charge.

## Aseptic technique

Clean your hands, use sterile gloves and instruments, and clean the wound from the cleanest area outwards.
`;

const WOUND_CARE_QUESTIONS: SeedQuestion[] = [
  {
    prompt: "Which of these is a sign of wound infection?",
    options: ["Spreading redness", "Dry skin", "Pale nail beds", "A slow pulse"],
    correct: 0,
    explanation: "Redness spreading from the wound can mean infection.",
    status: "approved",
  },
  {
    prompt: "In which direction do you clean a wound?",
    options: [
      "From the dirtiest area inwards",
      "From the cleanest area outwards",
      "In any direction",
      "Only around the edges",
    ],
    correct: 1,
    explanation: "Clean the wound from the cleanest area outwards.",
    status: "approved",
  },
  {
    prompt: "What do you record at each dressing change?",
    options: ["Only the date", "What you see in the wound", "The patient's diet", "Nothing"],
    correct: 1,
    explanation: "Record what you see each time the dressing is changed.",
  },
  {
    prompt: "What can pus from a wound mean?",
    options: ["Healing is complete", "Infection", "Dehydration", "Low blood pressure"],
    correct: 1,
    explanation: "Pus can mean the wound is infected.",
  },
  {
    prompt: "Which gloves do you use for an aseptic dressing?",
    options: ["Sterile gloves", "Clean non-sterile gloves", "Household rubber gloves", "No gloves"],
    correct: 0,
    explanation: "Aseptic technique uses sterile gloves and instruments.",
  },
  {
    prompt: "Who do you report signs of wound infection to?",
    options: ["The nurse in charge", "Another patient", "A visitor", "Nobody"],
    correct: 0,
    explanation: "Report signs of infection to the nurse in charge.",
  },
  {
    prompt: "Which of these is part of assessing a wound?",
    options: [
      "Its size and depth",
      "The patient's favourite food",
      "The colour of the bed sheet",
      "The time of day",
    ],
    correct: 0,
    explanation: "Look at the size and depth of the wound.",
  },
  {
    prompt: "What can increasing pain in a wound mean?",
    options: ["Infection", "Good healing", "Nothing at all", "The dressing is too clean"],
    correct: 0,
    explanation: "Increasing pain can mean infection.",
  },
  {
    prompt: "What is the first step of aseptic technique?",
    options: ["Clean your hands", "Open the wound", "Remove sterile gloves", "Write the notes"],
    correct: 0,
    explanation: "Aseptic technique starts with clean hands.",
  },
  {
    prompt: "What do you do about a bad smell from a wound?",
    options: ["Ignore it", "Report it", "Cover it with perfume", "Leave it until tomorrow"],
    correct: 1,
    explanation: "A bad smell can mean infection, so report it.",
  },
  {
    prompt: "What can heat around a wound mean?",
    options: ["Infection", "Normal healing only", "The room is warm", "Nothing"],
    correct: 0,
    explanation: "Heat around a wound can mean infection.",
  },
  {
    prompt: "What do you do with the skin around a wound?",
    options: ["Assess it too", "Ignore it", "Shave it", "Cover it without looking"],
    correct: 0,
    explanation: "Assessment includes the skin around the wound.",
  },
];

const WOUND_CARE_CARDS: SeedCard[] = [
  {
    front: "Name three signs of wound infection.",
    back: "Spreading redness, swelling and heat. Pain, pus or a bad smell too.",
  },
  { front: "Which way do you clean a wound?", back: "From the cleanest area outwards." },
  {
    front: "What do you record at a dressing change?",
    back: "What you see in the wound each time.",
  },
  {
    front: "What does aseptic technique use?",
    back: "Clean hands, sterile gloves and sterile instruments.",
  },
  { front: "Who do you report signs of infection to?", back: "The nurse in charge." },
  {
    front: "What do you look at when assessing a wound?",
    back: "Size, depth, the wound bed's colour, discharge and the skin around it.",
  },
  { front: "What can pus mean?", back: "Infection.", status: "draft" },
  { front: "What can a bad smell mean?", back: "Infection.", status: "draft" },
  { front: "Is increasing pain normal?", back: "No. It can mean infection.", status: "draft" },
  {
    front: "What is the first step of aseptic technique?",
    back: "Clean your hands.",
    status: "draft",
  },
];

const STERILISATION_NOTES = `## Cleaning, disinfection and sterilisation

Cleaning removes dirt and most microbes. Disinfection kills most microbes but not all spores. Sterilisation destroys all microbes, including spores. Clean instruments before sterilising them: dirt shields microbes from the steam.

## The autoclave

An autoclave uses steam under pressure. A common cycle is 121 °C for 15 minutes. It is the most reliable way to sterilise instruments that can take heat and moisture.

## Boiling

Boiling water kills most bacteria and viruses but does not reliably kill spores, so it is disinfection, not sterilisation.
`;

const STERILISATION_QUESTIONS: SeedQuestion[] = [
  {
    prompt: "Which method destroys all microbes, including spores?",
    options: ["Cleaning", "Disinfection", "Sterilisation", "Boiling"],
    correct: 2,
    explanation: "Sterilisation destroys all microbes, including spores.",
  },
  {
    prompt: "What is a common autoclave cycle?",
    options: [
      "100 °C for 5 minutes",
      "121 °C for 15 minutes",
      "60 °C for 30 minutes",
      "180 °C for 2 minutes",
    ],
    correct: 1,
    explanation: "A common autoclave cycle is 121 °C for 15 minutes.",
  },
  {
    prompt: "Why is boiling not sterilisation?",
    options: [
      "It is too slow",
      "It does not reliably kill spores",
      "It damages every instrument",
      "It uses too much water",
    ],
    correct: 1,
    explanation: "Boiling does not reliably kill spores.",
  },
  {
    prompt: "What does an autoclave use?",
    options: ["Dry heat", "Steam under pressure", "Ultraviolet light", "Chemical vapour"],
    correct: 1,
    explanation: "An autoclave uses steam under pressure.",
  },
  {
    prompt: "What does cleaning remove?",
    options: ["All spores", "Dirt and most microbes", "Only viruses", "Nothing useful"],
    correct: 1,
    explanation: "Cleaning removes dirt and most microbes.",
  },
  {
    prompt: "What does disinfection kill?",
    options: [
      "All microbes and spores",
      "Most microbes but not all spores",
      "Only dirt",
      "Only fungi",
    ],
    correct: 1,
    explanation: "Disinfection kills most microbes but not all spores.",
  },
];

const STERILISATION_CARDS: SeedCard[] = [
  { front: "What does sterilisation do?", back: "Destroys all microbes, including spores." },
  { front: "What does disinfection do?", back: "Kills most microbes, but not all spores." },
  { front: "What does cleaning do?", back: "Removes dirt and most microbes." },
  { front: "What does an autoclave use?", back: "Steam under pressure." },
  { front: "What is a common autoclave cycle?", back: "121 °C for 15 minutes." },
  { front: "Is boiling sterilisation?", back: "No. It does not reliably kill spores." },
  {
    front: "What is the most reliable way to sterilise heat-safe instruments?",
    back: "The autoclave.",
  },
  { front: "What can survive disinfection?", back: "Some spores." },
  { front: "What does boiling water kill?", back: "Most bacteria and viruses." },
  {
    front: "Why clean instruments before sterilising them?",
    back: "Dirt shields microbes from the steam.",
  },
];

const HAND_HYGIENE_NOTES = `## Hand hygiene

Hand hygiene is the most important way to stop infection spreading between patients.

## The five moments

Clean your hands before touching a patient, before a clean or aseptic procedure, after contact with body fluids, after touching a patient, and after touching the patient's surroundings.

## Soap or hand rub

Use soap and water when hands are visibly dirty. Otherwise an alcohol-based hand rub is quicker and works well. Rub for 20 to 30 seconds, covering every surface of both hands.
`;

/** Exactly five, so every quiz on this chapter uses all of them. */
export const HAND_HYGIENE_QUESTIONS: SeedQuestion[] = [
  {
    prompt: "What is the most important way to stop infection spreading between patients?",
    options: ["Wearing a mask", "Hand hygiene", "Opening the windows", "Taking antibiotics"],
    correct: 1,
    explanation: "Hand hygiene is the most important way to stop infection spreading.",
  },
  {
    prompt: "When do you use soap and water instead of hand rub?",
    options: ["Always", "When hands are visibly dirty", "Never", "Only at the end of a shift"],
    correct: 1,
    explanation: "Use soap and water when hands are visibly dirty.",
  },
  {
    prompt: "How long do you rub with an alcohol-based hand rub?",
    options: ["5 seconds", "20 to 30 seconds", "2 minutes", "5 minutes"],
    correct: 1,
    explanation: "Rub for 20 to 30 seconds, covering every surface of both hands.",
  },
  {
    prompt: "Which of these is one of the five moments for hand hygiene?",
    options: [
      "Before touching a patient",
      "Before eating lunch",
      "After answering the phone",
      "Before writing notes",
    ],
    correct: 0,
    explanation: "Clean your hands before touching a patient.",
  },
  {
    prompt: "Which of these is also one of the five moments?",
    options: [
      "After touching the patient's surroundings",
      "Before entering the hospital",
      "After a tea break",
      "Before a handover",
    ],
    correct: 0,
    explanation: "Clean your hands after touching the patient's surroundings.",
  },
];

const HAND_HYGIENE_CARDS: SeedCard[] = [
  { front: "What is the most important way to stop infection spreading?", back: "Hand hygiene." },
  { front: "Hand hygiene moment 1", back: "Before touching a patient." },
  { front: "Hand hygiene moment 2", back: "Before a clean or aseptic procedure." },
  { front: "Hand hygiene moment 3", back: "After contact with body fluids." },
  { front: "Hand hygiene moment 4", back: "After touching a patient." },
  { front: "Hand hygiene moment 5", back: "After touching the patient's surroundings." },
  { front: "When do you use soap and water?", back: "When hands are visibly dirty." },
  {
    front: "How long do you rub with hand rub?",
    back: "20 to 30 seconds, covering every surface of both hands.",
  },
];

export const CHAPTERS: SeedChapter[] = [
  {
    id: IDS.vitalSigns,
    subjectId: IDS.fundamentals,
    title: "Vital signs",
    order: 1,
    status: "published",
    notes: VITAL_SIGNS_NOTES,
    questions: VITAL_SIGNS_QUESTIONS,
    cards: VITAL_SIGNS_CARDS,
  },
  {
    id: IDS.woundCare,
    subjectId: IDS.fundamentals,
    title: "Wound care",
    order: 2,
    status: "draft",
    notes: WOUND_CARE_NOTES,
    questions: WOUND_CARE_QUESTIONS.map((q) => ({ ...q, status: q.status ?? "draft" })),
    cards: WOUND_CARE_CARDS,
  },
  {
    id: IDS.sterilisation,
    subjectId: IDS.microbiology,
    title: "Sterilisation and disinfection",
    order: 1,
    status: "published",
    notes: STERILISATION_NOTES,
    questions: STERILISATION_QUESTIONS,
    cards: STERILISATION_CARDS,
  },
  {
    id: IDS.handHygiene,
    subjectId: IDS.microbiology,
    title: "Hand hygiene",
    order: 2,
    status: "published",
    notes: HAND_HYGIENE_NOTES,
    questions: HAND_HYGIENE_QUESTIONS,
    cards: HAND_HYGIENE_CARDS,
  },
];

/** Question and flashcard ids: kind 6 and 7, numbered by chapter then position. */
export function questionId(chapterId: string, index: number) {
  const chapter = CHAPTERS.findIndex((c) => c.id === chapterId) + 1;
  return fixedId(6, chapter * 100 + index + 1);
}

export function cardId(chapterId: string, index: number) {
  const chapter = CHAPTERS.findIndex((c) => c.id === chapterId) + 1;
  return fixedId(7, chapter * 100 + index + 1);
}

/** The headings the stubbed Ask Florence reply cites (see e2e/stubs/anthropic.ts). */
export const TUTOR_STUB_SOURCE = "Pulse";
