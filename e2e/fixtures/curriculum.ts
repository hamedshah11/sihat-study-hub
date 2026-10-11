// Curriculum for the end-to-end tests: one programme, two semesters, one batch
// with a working batch code, two Semester 1 subjects with published chapters,
// and a Semester 2 draft chapter for the faculty review tests (students in
// Semester 1 never see it, so publishing it in a test changes nothing for them).
//
// Every row has a fixed id so the seed is idempotent and tests can refer to it.

/** A fixed, valid UUID: e2e0<group>-0000-4000-8000-<n>. */
export function e2eId(group: number, n = 0): string {
  return `e2e0${group.toString(16).padStart(4, "0")}-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
}

export const PROGRAMME = { id: e2eId(1), name: "BSN Generic", total_semesters: 8 };

export const SEMESTER_1 = { id: e2eId(2, 1), name: "Semester 1", number: 1 };
export const SEMESTER_2 = { id: e2eId(2, 2), name: "Semester 2", number: 2 };

export const BATCH = { id: e2eId(3), name: "SIHAT BSN 2026" };
export const BATCH_CODE = "SIHAT-E2E-26";

export const MICROBIOLOGY = {
  id: e2eId(4, 1),
  name: "Microbiology",
  colour: "mint",
  display_order: 1,
  semester_id: SEMESTER_1.id,
};
export const ANATOMY = {
  id: e2eId(4, 2),
  name: "Anatomy and Physiology I",
  colour: "violet",
  display_order: 2,
  semester_id: SEMESTER_1.id,
};
export const FUNDAMENTALS_2 = {
  id: e2eId(4, 3),
  name: "Fundamentals of Nursing II",
  colour: "cobalt",
  display_order: 1,
  semester_id: SEMESTER_2.id,
};

/** Fixed so "Updated 1 Oct 2026" never changes in screenshots. */
export const CONTENT_UPDATED_AT = "2026-10-01T06:00:00.000Z";

export type QuestionSeed = {
  prompt: string;
  options: string[];
  correct: number;
  explanation: string;
  difficulty?: "easy" | "medium" | "hard";
  status?: "approved" | "draft";
};
export type CardSeed = { front: string; back: string; hint?: string };

export type ChapterSeed = {
  id: string;
  subject_id: string;
  title: string;
  display_order: number;
  status: "published" | "draft";
  summary_md: string;
  questions: QuestionSeed[];
  flashcards: CardSeed[];
};

const INFECTION_CONTROL_NOTES = `## Chain of infection

Infection spreads when six links join: an infectious agent, a reservoir, a portal of exit, a mode of transmission, a portal of entry and a susceptible host. Breaking any one link stops the spread. On the ward, nurses break the chain most often at the mode of transmission, with clean hands and the right protective equipment.

## Hand hygiene

Hand hygiene is the single most effective way to prevent healthcare-associated infections. Clean your hands at the five moments: before touching a patient, before a clean or aseptic procedure, after a risk of body fluid exposure, after touching a patient and after touching the patient's surroundings.

Use an alcohol-based hand rub for 20 to 30 seconds when hands are not visibly soiled. Wash with soap and water for 40 to 60 seconds when hands are visibly dirty, and after caring for a patient with diarrhoea, because alcohol does not kill *Clostridioides difficile* spores.

## Personal protective equipment

Personal protective equipment (PPE) protects the nurse and the patient. Choose it by the expected exposure, not by the diagnosis alone.

Put PPE on in this order: gown, mask or respirator, goggles or face shield, then gloves. Take it off in the order that touches the dirtiest items first: gloves, goggles, gown, then the mask, and clean your hands afterwards.

## Standard and transmission-based precautions

Standard precautions apply to every patient, every time. Transmission-based precautions are added for known or suspected infections: contact precautions for organisms such as MRSA, droplet precautions for influenza, and airborne precautions with an N95 respirator for tuberculosis and measles.

## Sharps and waste

Never recap a used needle. Drop sharps straight into a puncture-resistant sharps container and close it when it is three-quarters full. Segregate hospital waste at the point of use, following your hospital's colour coding.`;

const STERILISATION_NOTES = `## Cleaning, disinfection and sterilisation

Cleaning removes visible dirt and most microorganisms, and always comes first. Disinfection kills most microorganisms but not all bacterial spores. Sterilisation destroys all forms of microbial life, including spores.

## Choosing the method

Items that enter sterile tissue or the bloodstream, such as surgical instruments, must be sterile. Items that touch mucous membranes need high-level disinfection. Items that touch only intact skin, such as a blood pressure cuff, need cleaning and low-level disinfection.

## The autoclave

The autoclave sterilises with steam under pressure. A common cycle is 121 °C for 15 minutes. Chemical indicator tape changes colour to show that a pack has been through the cycle, but only a biological indicator shows that spores were killed.`;

const CELL_NOTES = `## The cell

The cell is the basic structural and functional unit of the body. Each cell is surrounded by a plasma membrane, holds cytoplasm and organelles, and in most cells contains a nucleus.

## Plasma membrane

The plasma membrane is a phospholipid bilayer with embedded proteins. It is selectively permeable: it controls what enters and leaves the cell.

## Organelles

Mitochondria produce most of the cell's energy as ATP, which is why they are called the powerhouse of the cell. Ribosomes make proteins. The rough endoplasmic reticulum carries ribosomes and processes proteins; the smooth endoplasmic reticulum makes lipids. The Golgi apparatus modifies, sorts and packages proteins. Lysosomes contain enzymes that digest worn-out parts of the cell.

## The nucleus

The nucleus holds the cell's DNA and controls its activities. Mature red blood cells have no nucleus, which leaves more room for haemoglobin.`;

const VITAL_SIGNS_NOTES = `## Vital signs

Vital signs are temperature, pulse, respiration and blood pressure, with oxygen saturation and pain often recorded alongside them. Compare every reading with the patient's own baseline and report changes.

## Temperature

Normal oral temperature in adults is about 36.5 °C to 37.5 °C. A rise above the normal range is a fever (pyrexia).

## Pulse

The normal adult resting pulse is 60 to 100 beats per minute. Count the radial pulse for a full minute when it is irregular. A pulse below 60 is bradycardia; above 100 is tachycardia.

## Respiration

The normal adult respiratory rate is 12 to 20 breaths per minute. Count respirations without telling the patient, because people change their breathing when they know it is being watched.

## Blood pressure

Use a cuff of the right size: a cuff that is too small gives a falsely high reading. Support the patient's arm at heart level.`;

const INFECTION_CONTROL_QUESTIONS: QuestionSeed[] = [
  {
    prompt: "What is the single most effective way to prevent healthcare-associated infections?",
    options: [
      "Wearing gloves for every task",
      "Hand hygiene",
      "Giving antibiotics",
      "Isolating every patient",
    ],
    correct: 1,
    explanation: "Clean hands break the chain of infection at the mode of transmission.",
  },
  {
    prompt: "How long should an alcohol-based hand rub take?",
    options: ["5 to 10 seconds", "20 to 30 seconds", "2 minutes", "5 minutes"],
    correct: 1,
    explanation: "Rub for 20 to 30 seconds, until the hands are dry.",
  },
  {
    prompt: "When should you wash with soap and water instead of using hand rub?",
    options: [
      "Before every injection",
      "When hands are visibly soiled",
      "Only at the start of a shift",
      "After writing in the notes",
    ],
    correct: 1,
    explanation: "Hand rub does not remove visible dirt or body fluids.",
  },
  {
    prompt: "Why is soap and water preferred after caring for a patient with diarrhoea?",
    options: [
      "It is quicker",
      "Alcohol does not kill Clostridioides difficile spores",
      "Hand rub stains the skin",
      "Gloves are not needed",
    ],
    correct: 1,
    explanation: "Spores survive alcohol, so they must be washed off.",
  },
  {
    prompt: "Which of these is one of the five moments for hand hygiene?",
    options: [
      "Before entering the ward",
      "After touching the patient's surroundings",
      "Before writing a care plan",
      "After a tea break only",
    ],
    correct: 1,
    explanation: "Surroundings such as the bed rails carry the patient's organisms.",
  },
  {
    prompt: "What should you put on first when donning PPE?",
    options: ["Gloves", "Goggles", "Gown", "Mask"],
    correct: 2,
    explanation: "The order is gown, mask or respirator, goggles or face shield, then gloves.",
  },
  {
    prompt: "What should you take off first when removing PPE?",
    options: ["Mask", "Gown", "Goggles", "Gloves"],
    correct: 3,
    explanation: "Gloves are the most contaminated item, so they come off first.",
  },
  {
    prompt: "Which precautions apply to every patient, every time?",
    options: [
      "Airborne precautions",
      "Standard precautions",
      "Contact precautions",
      "Protective isolation",
    ],
    correct: 1,
    explanation: "Transmission-based precautions are added on top of standard precautions.",
  },
  {
    prompt: "Which respirator is used for a patient with suspected tuberculosis?",
    options: ["Surgical mask", "Cloth mask", "N95 respirator", "No mask is needed"],
    correct: 2,
    explanation: "Tuberculosis spreads by the airborne route and needs an N95 respirator.",
  },
  {
    prompt: "Which precautions are used for a patient with influenza?",
    options: ["Droplet precautions", "Airborne precautions", "Standard precautions only", "None"],
    correct: 0,
    explanation: "Influenza spreads in large droplets over short distances.",
  },
  {
    prompt: "What should you do with a used needle?",
    options: [
      "Recap it carefully",
      "Bend it before disposal",
      "Drop it straight into a sharps container",
      "Put it in the general waste",
    ],
    correct: 2,
    explanation: "Recapping is the commonest cause of needlestick injuries.",
  },
  {
    prompt: "When should a sharps container be closed?",
    options: [
      "When it is completely full",
      "When it is three-quarters full",
      "Every hour",
      "At the end of each week",
    ],
    correct: 1,
    explanation: "An overfilled container risks needlestick injuries.",
  },
  {
    prompt: "How many links are there in the chain of infection?",
    options: ["Three", "Four", "Six", "Eight"],
    correct: 2,
    explanation:
      "Agent, reservoir, portal of exit, mode of transmission, portal of entry and susceptible host.",
  },
  {
    prompt: "Which link of the chain do clean hands break?",
    options: ["Reservoir", "Mode of transmission", "Susceptible host", "Infectious agent"],
    correct: 1,
    explanation: "Hands carry organisms from one patient to the next.",
  },
  {
    prompt: "How should you choose personal protective equipment?",
    options: [
      "By the patient's diagnosis alone",
      "By the expected exposure",
      "By what is nearest",
      "By the ward's colour",
    ],
    correct: 1,
    explanation: "Think about the task and what you might be exposed to.",
  },
];

const STERILISATION_QUESTIONS: QuestionSeed[] = [
  {
    prompt: "Which process destroys all microbial life, including spores?",
    options: ["Cleaning", "Low-level disinfection", "Sterilisation", "Rinsing"],
    correct: 2,
    explanation: "Only sterilisation kills spores reliably.",
  },
  {
    prompt: "What must always happen before disinfection or sterilisation?",
    options: ["Cleaning", "Drying in the sun", "Labelling", "Soaking overnight"],
    correct: 0,
    explanation: "Dirt shields microorganisms from the disinfectant or steam.",
  },
  {
    prompt: "What does the autoclave use to sterilise?",
    options: ["Dry heat", "Steam under pressure", "Ultraviolet light", "Alcohol"],
    correct: 1,
    explanation: "Moist heat under pressure kills spores quickly.",
  },
  {
    prompt: "Which item needs only cleaning and low-level disinfection?",
    options: [
      "A surgical scissor",
      "A urinary catheter",
      "A blood pressure cuff",
      "A suture needle",
    ],
    correct: 2,
    explanation: "It touches only intact skin.",
  },
  {
    prompt: "What shows that spores were actually killed in an autoclave cycle?",
    options: ["Indicator tape", "A biological indicator", "The pack feels warm", "The timer"],
    correct: 1,
    explanation: "Indicator tape only shows the pack went through the cycle.",
  },
];

const CELL_QUESTIONS: QuestionSeed[] = [
  {
    prompt: "Which organelle produces most of the cell's ATP?",
    options: ["Ribosome", "Mitochondrion", "Golgi apparatus", "Lysosome"],
    correct: 1,
    explanation: "Mitochondria are the powerhouse of the cell.",
  },
  {
    prompt: "Where are proteins made?",
    options: ["Ribosomes", "Lysosomes", "Smooth endoplasmic reticulum", "Nucleus"],
    correct: 0,
    explanation: "Ribosomes read messenger RNA and build proteins.",
  },
  {
    prompt: "What does the Golgi apparatus do?",
    options: [
      "Makes lipids",
      "Digests worn-out parts",
      "Modifies, sorts and packages proteins",
      "Stores DNA",
    ],
    correct: 2,
    explanation: "It prepares proteins for use inside or outside the cell.",
  },
  {
    prompt: "Which cells have no nucleus when mature?",
    options: ["Nerve cells", "Muscle cells", "Red blood cells", "Liver cells"],
    correct: 2,
    explanation: "This leaves more room for haemoglobin.",
  },
  {
    prompt: "What is the plasma membrane mainly made of?",
    options: ["A phospholipid bilayer", "Cellulose", "Keratin", "Collagen fibres"],
    correct: 0,
    explanation: "Proteins sit within the phospholipid bilayer.",
  },
];

const VITAL_SIGNS_APPROVED: QuestionSeed[] = [
  [
    "What is the normal adult resting pulse?",
    [
      "40 to 60 beats per minute",
      "60 to 100 beats per minute",
      "100 to 120 beats per minute",
      "120 to 140 beats per minute",
    ],
    1,
    "Below 60 is bradycardia and above 100 is tachycardia.",
  ],
  [
    "What is the normal adult respiratory rate?",
    [
      "6 to 10 breaths per minute",
      "12 to 20 breaths per minute",
      "24 to 30 breaths per minute",
      "30 to 40 breaths per minute",
    ],
    1,
    "Count for a full minute if the breathing is irregular.",
  ],
  [
    "What is a pulse above 100 beats per minute called?",
    ["Bradycardia", "Tachycardia", "Apnoea", "Hypotension"],
    1,
    "Tachycardia means a fast heart rate.",
  ],
  [
    "What is a pulse below 60 beats per minute called?",
    ["Bradycardia", "Tachypnoea", "Pyrexia", "Hypertension"],
    0,
    "Bradycardia means a slow heart rate.",
  ],
  [
    "What happens if the blood pressure cuff is too small?",
    [
      "The reading is falsely low",
      "The reading is falsely high",
      "Nothing changes",
      "The pulse is lost",
    ],
    1,
    "A narrow cuff needs more pressure to close the artery.",
  ],
  [
    "Where should the arm be when measuring blood pressure?",
    ["Above the head", "At heart level", "Hanging down", "Across the chest"],
    1,
    "Arm position changes the reading.",
  ],
  [
    "Why count respirations without telling the patient?",
    [
      "To save time",
      "People change their breathing when watched",
      "It is more polite",
      "To check the pulse at the same time",
    ],
    1,
    "Awareness changes the rate and depth of breathing.",
  ],
  [
    "What is a temperature above the normal range called?",
    ["Hypothermia", "Pyrexia", "Hypoxia", "Syncope"],
    1,
    "Pyrexia is another word for fever.",
  ],
  [
    "What should every reading be compared with?",
    ["The ward average", "The patient's own baseline", "Yesterday's patient", "A textbook picture"],
    1,
    "Change from baseline matters more than one number.",
  ],
  [
    "How long should an irregular radial pulse be counted?",
    ["15 seconds", "30 seconds", "A full minute", "Five minutes"],
    2,
    "A short count misses irregular beats.",
  ],
  [
    "Which of these is a vital sign?",
    ["Weight", "Respiration", "Height", "Blood group"],
    1,
    "Temperature, pulse, respiration and blood pressure are the vital signs.",
  ],
  [
    "What is the normal adult oral temperature?",
    ["About 34 °C to 35 °C", "About 36.5 °C to 37.5 °C", "About 38.5 °C to 39.5 °C", "About 40 °C"],
    1,
    "Readings vary a little by site and time of day.",
  ],
  [
    "What is often recorded alongside the four vital signs?",
    ["Oxygen saturation", "Shoe size", "Blood group", "Eye colour"],
    0,
    "Oxygen saturation and pain are often recorded too.",
  ],
].map(([prompt, options, correct, explanation]) => ({
  prompt: prompt as string,
  options: options as string[],
  correct: correct as number,
  explanation: explanation as string,
}));

/** Five AI drafts waiting for faculty review. */
export const VITAL_SIGNS_DRAFTS: QuestionSeed[] = [
  [
    "Which artery is used most often to count the pulse?",
    ["Femoral", "Radial", "Popliteal", "Dorsalis pedis"],
    1,
    "The radial artery is easy to reach at the wrist.",
  ],
  [
    "What does a respiratory rate of 28 breaths per minute in an adult suggest?",
    ["Bradypnoea", "Tachypnoea", "Normal breathing", "Apnoea"],
    1,
    "Above 20 breaths per minute is fast for an adult at rest.",
  ],
  [
    "Which reading should be reported straight away?",
    [
      "A pulse of 72",
      "A respiratory rate of 16",
      "A sudden fall in blood pressure from the baseline",
      "A temperature of 37.0 °C",
    ],
    2,
    "A sudden change from baseline can mean deterioration.",
  ],
  [
    "What is the systolic pressure?",
    [
      "The pressure when the heart relaxes",
      "The pressure when the heart contracts",
      "The pulse rate",
      "The breathing rate",
    ],
    1,
    "Systolic pressure is the higher number.",
  ],
  [
    "What is the diastolic pressure?",
    [
      "The pressure when the heart relaxes",
      "The pressure when the heart contracts",
      "The oxygen level",
      "The temperature",
    ],
    0,
    "Diastolic pressure is the lower number.",
  ],
].map(([prompt, options, correct, explanation]) => ({
  prompt: prompt as string,
  options: options as string[],
  correct: correct as number,
  explanation: explanation as string,
  status: "draft" as const,
}));

const INFECTION_CONTROL_CARDS: CardSeed[] = [
  {
    front: "What is the single most effective way to prevent healthcare-associated infections?",
    back: "Hand hygiene.",
  },
  {
    front: "How long should an alcohol-based hand rub take?",
    back: "20 to 30 seconds, until the hands are dry.",
  },
  { front: "How long should a soap and water hand wash take?", back: "40 to 60 seconds." },
  {
    front: "When must you use soap and water rather than hand rub?",
    back: "When hands are visibly soiled, and after caring for a patient with diarrhoea.",
  },
  {
    front: "Why doesn't hand rub work against Clostridioides difficile?",
    back: "Alcohol does not kill its spores; they must be washed off.",
  },
  {
    front: "Name the five moments for hand hygiene.",
    back: "Before touching a patient, before a clean or aseptic procedure, after body fluid exposure risk, after touching a patient, after touching the patient's surroundings.",
  },
  {
    front: "List the six links in the chain of infection.",
    back: "Infectious agent, reservoir, portal of exit, mode of transmission, portal of entry, susceptible host.",
  },
  {
    front: "Which link of the chain of infection do nurses break most often?",
    back: "The mode of transmission.",
  },
  {
    front: "What is a reservoir in the chain of infection?",
    back: "Where the organism lives and multiplies, such as a person, water or equipment.",
    hint: "Think of where germs live.",
  },
  { front: "What does PPE stand for?", back: "Personal protective equipment." },
  {
    front: "How do you choose PPE?",
    back: "By the expected exposure, not by the diagnosis alone.",
  },
  {
    front: "In what order do you put PPE on?",
    back: "Gown, mask or respirator, goggles or face shield, then gloves.",
  },
  {
    front: "In what order do you take PPE off?",
    back: "Gloves, goggles, gown, then the mask. Clean your hands afterwards.",
  },
  { front: "Why do gloves come off first?", back: "They are the most contaminated item." },
  {
    front: "What are standard precautions?",
    back: "Infection control measures used for every patient, every time.",
  },
  { front: "Which precautions are used for MRSA?", back: "Contact precautions." },
  { front: "Which precautions are used for influenza?", back: "Droplet precautions." },
  {
    front: "Which precautions are used for tuberculosis and measles?",
    back: "Airborne precautions with an N95 respirator.",
  },
  {
    front: "Should you recap a used needle?",
    back: "No. Drop it straight into a sharps container.",
  },
  { front: "When should a sharps container be closed?", back: "When it is three-quarters full." },
  {
    front: "Where should hospital waste be segregated?",
    back: "At the point of use, following the hospital's colour coding.",
  },
  {
    front: "What is a healthcare-associated infection?",
    back: "An infection a patient develops while receiving care that was not present on admission.",
  },
  {
    front: "What is a susceptible host?",
    back: "A person who cannot resist the organism, for example because of age, illness or a wound.",
  },
  {
    front: "Give one portal of entry.",
    back: "A break in the skin, the respiratory tract, the urinary tract or a mucous membrane.",
  },
  {
    front: "What should you do after removing gloves?",
    back: "Clean your hands. Gloves do not replace hand hygiene.",
  },
];

const STERILISATION_CARDS: CardSeed[] = [
  {
    front: "What does cleaning do?",
    back: "Removes visible dirt and most microorganisms. It always comes first.",
  },
  {
    front: "What does disinfection do?",
    back: "Kills most microorganisms, but not all bacterial spores.",
  },
  { front: "What does sterilisation do?", back: "Destroys all microbial life, including spores." },
  {
    front: "Which items must be sterile?",
    back: "Items that enter sterile tissue or the bloodstream, such as surgical instruments.",
  },
  {
    front: "Which items need high-level disinfection?",
    back: "Items that touch mucous membranes.",
  },
  { front: "How does an autoclave sterilise?", back: "With steam under pressure." },
  { front: "What is a common autoclave cycle?", back: "121 °C for 15 minutes." },
  {
    front: "What does indicator tape show?",
    back: "That the pack has been through the cycle, not that spores were killed.",
  },
];

const CELL_CARDS: CardSeed[] = [
  { front: "What is the basic structural and functional unit of the body?", back: "The cell." },
  {
    front: "What is the plasma membrane made of?",
    back: "A phospholipid bilayer with embedded proteins.",
  },
  {
    front: "What does selectively permeable mean?",
    back: "The membrane controls what enters and leaves the cell.",
  },
  {
    front: "Which organelle is the powerhouse of the cell?",
    back: "The mitochondrion, which produces ATP.",
  },
  { front: "What do ribosomes do?", back: "They make proteins." },
  { front: "What does the smooth endoplasmic reticulum make?", back: "Lipids." },
  { front: "What does the Golgi apparatus do?", back: "Modifies, sorts and packages proteins." },
  { front: "What do lysosomes contain?", back: "Enzymes that digest worn-out parts of the cell." },
  {
    front: "What does the nucleus hold?",
    back: "The cell's DNA. It controls the cell's activities.",
  },
  {
    front: "Why do mature red blood cells have no nucleus?",
    back: "It leaves more room for haemoglobin.",
  },
];

const VITAL_SIGNS_CARDS: CardSeed[] = [
  ["What are the four vital signs?", "Temperature, pulse, respiration and blood pressure."],
  ["What is the normal adult resting pulse?", "60 to 100 beats per minute."],
  ["What is the normal adult respiratory rate?", "12 to 20 breaths per minute."],
  ["What is bradycardia?", "A pulse below 60 beats per minute."],
  ["What is tachycardia?", "A pulse above 100 beats per minute."],
  ["What is pyrexia?", "A temperature above the normal range: a fever."],
  ["What is the normal adult oral temperature?", "About 36.5 °C to 37.5 °C."],
  ["What should each reading be compared with?", "The patient's own baseline."],
  ["How long do you count an irregular pulse?", "A full minute."],
  [
    "Why count respirations without telling the patient?",
    "People change their breathing when watched.",
  ],
  ["What happens with a cuff that is too small?", "The blood pressure reads falsely high."],
  ["Where should the arm be for a blood pressure reading?", "Supported at heart level."],
  ["What is systolic pressure?", "The pressure when the heart contracts."],
  ["What is diastolic pressure?", "The pressure when the heart relaxes."],
  ["Which pulse is counted most often?", "The radial pulse."],
  ["What is tachypnoea?", "Fast breathing: above 20 breaths per minute in an adult."],
  ["What is bradypnoea?", "Slow breathing: below 12 breaths per minute in an adult."],
  ["What is apnoea?", "No breathing."],
  ["What is hypotension?", "Low blood pressure."],
  ["What is hypertension?", "High blood pressure."],
  ["What is often recorded with the vital signs?", "Oxygen saturation and pain."],
  [
    "What should you do with an abnormal reading?",
    "Recheck it, compare with the baseline and report it.",
  ],
  [
    "Which site gives a core temperature?",
    "The rectal or tympanic route is closer to core than the axilla.",
  ],
  ["What can raise the pulse besides illness?", "Exercise, anxiety, pain and fever."],
  ["What is pulse deficit?", "The difference between the apical and radial pulse rates."],
].map(([front, back]) => ({ front, back }));

export const MICRO_CH1: ChapterSeed = {
  id: e2eId(5, 1),
  subject_id: MICROBIOLOGY.id,
  title: "Infection control and hand hygiene",
  display_order: 1,
  status: "published",
  summary_md: INFECTION_CONTROL_NOTES,
  questions: INFECTION_CONTROL_QUESTIONS,
  flashcards: INFECTION_CONTROL_CARDS,
};
export const MICRO_CH2: ChapterSeed = {
  id: e2eId(5, 2),
  subject_id: MICROBIOLOGY.id,
  title: "Sterilisation and disinfection",
  display_order: 2,
  status: "published",
  summary_md: STERILISATION_NOTES,
  questions: STERILISATION_QUESTIONS,
  flashcards: STERILISATION_CARDS,
};
export const ANAT_CH1: ChapterSeed = {
  id: e2eId(5, 3),
  subject_id: ANATOMY.id,
  title: "The cell",
  display_order: 1,
  status: "published",
  summary_md: CELL_NOTES,
  questions: CELL_QUESTIONS,
  flashcards: CELL_CARDS,
};
/** Thirteen approved questions and five drafts: two short of the checklist's 15. */
export const VITALS_DRAFT: ChapterSeed = {
  id: e2eId(5, 4),
  subject_id: FUNDAMENTALS_2.id,
  title: "Vital signs",
  display_order: 1,
  status: "draft",
  summary_md: VITAL_SIGNS_NOTES,
  questions: [...VITAL_SIGNS_APPROVED, ...VITAL_SIGNS_DRAFTS],
  flashcards: VITAL_SIGNS_CARDS,
};

export const CHAPTERS = [MICRO_CH1, MICRO_CH2, ANAT_CH1, VITALS_DRAFT];

/**
 * An approved diagram in "The cell", shown as a figure under the notes. Its
 * image is a real file in the local `diagrams` bucket (the seed uploads the
 * app icon), so the offline test can check the image itself is stored.
 */
export const CELL_DIAGRAM = {
  id: e2eId(9, 1),
  chapter_id: ANAT_CH1.id,
  title: "Parts of a cell",
  image_path: "e2e/parts-of-a-cell.png",
  status: "approved",
  display_order: 1,
  pins: [],
  updated_at: CONTENT_UPDATED_AT,
};

/** Question ids: group 6, chapter number in the high bits. */
export function questionId(chapter: ChapterSeed, index: number): string {
  return e2eId(6, chapterNumber(chapter) * 1000 + index);
}
/** Flashcard ids: group 7. */
export function flashcardId(chapter: ChapterSeed, index: number): string {
  return e2eId(7, chapterNumber(chapter) * 1000 + index);
}

function chapterNumber(chapter: ChapterSeed): number {
  return CHAPTERS.indexOf(chapter) + 1;
}

/** Look up a seeded question by the prompt shown on screen. */
export function findQuestion(prompt: string): { chapter: ChapterSeed; question: QuestionSeed } {
  for (const chapter of CHAPTERS) {
    const question = chapter.questions.find((q) => q.prompt === prompt.trim());
    if (question) return { chapter, question };
  }
  throw new Error(`No seeded question with the prompt "${prompt}"`);
}
