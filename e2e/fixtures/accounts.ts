import { e2eId } from "./curriculum.ts";

// Test accounts. Each journey has its own student so tests never share
// progress rows; every test resets its student before it starts.

export type Account = {
  key: string;
  id: string;
  name: string;
  email?: string;
  phone?: string;
  role: "student" | "instructor";
};

/** Every seeded account can also sign in with this password (tests only). */
export const E2E_PASSWORD = "florence-e2e-password";

/** The phone number with a fixed SMS code in supabase/config.toml. */
export const TEST_PHONE = { e164: "+923000000001", typed: "0300 0000001", code: "123456" };

const student = (n: number, key: string, name: string, extra: Partial<Account> = {}): Account => ({
  key,
  id: e2eId(8, n),
  name,
  email: `${key}@example.com`,
  role: "student",
  ...extra,
});

export const ACCOUNTS = {
  /** Screenshots: a student a week into the semester. */
  shots: student(1, "ayesha", "Ayesha Memon"),
  signIn: student(2, "sana", "Sana Baloch"),
  phone: student(3, "bilal", "Bilal Soomro", { email: undefined, phone: TEST_PHONE.e164 }),
  review: student(4, "hina", "Hina Shaikh"),
  quiz: student(5, "zainab", "Zainab Abbasi"),
  mistakes: student(6, "fatima", "Fatima Jatoi"),
  tutor: student(7, "imran", "Imran Khoso"),
  theme: student(8, "rabia", "Rabia Chandio"),
  securityA: student(9, "sadia", "Sadia Qureshi"),
  securityB: student(10, "nadia", "Nadia Lashari"),
  /** Downloads a chapter, reads it with no signal, then logs out. */
  offline: student(11, "maryam", "Maryam Mahar"),
  /** Signs in on the same phone afterwards and must see no downloads. */
  offlineSecond: student(12, "kashif", "Kashif Jamali"),
  faculty: {
    key: "saima",
    id: e2eId(8, 100),
    name: "Dr Saima Bhutto",
    email: "saima.faculty@example.com",
    role: "instructor",
  },
} satisfies Record<string, Account>;

export type AccountKey = keyof typeof ACCOUNTS;

/** New students made by the join journey use this pattern; the seed tidies them up. */
export const JOIN_EMAIL_PREFIX = "join-";
