// Phone-or-email sign-in helpers. Students sign in with a phone number or an
// email address and a one-time code; no college email is needed.
//
// Phone codes need an SMS provider switched on in Supabase (Auth → Providers
// → Phone). Until it is, PHONE_SIGN_IN stays false and the join and sign-in
// screens ask for an email only, so nobody types a number that can't work.

/** Flip to true once an SMS provider is set up and tested in production. */
export const PHONE_SIGN_IN = false;

/** "0300 1234567", "92300…", "+92 300…" → "+923001234567". Null if not a phone number. */
export function normalisePhone(raw: string): string | null {
  const digits = raw.replace(/[\s\-().]/g, "");
  if (!/^\+?\d{8,15}$/.test(digits)) return null;
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("0092")) return `+${digits.slice(2)}`;
  if (digits.startsWith("92") && digits.length === 12) return `+${digits}`;
  if (digits.startsWith("03") && digits.length === 11) return `+92${digits.slice(1)}`;
  if (digits.startsWith("3") && digits.length === 10) return `+92${digits}`;
  return null;
}

export function isEmail(raw: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim());
}

/** Supabase says this when the phone provider isn't configured. */
export function isPhoneUnavailable(message: string) {
  return /phone.*(disabled|not enabled|provider)|sms.*(provider|disabled)|unsupported phone/i.test(
    message,
  );
}

/** Show "+923001234567" back to the student the way they typed it. */
export function displayPhone(e164: string) {
  if (e164.startsWith("+92") && e164.length === 13) return `0${e164.slice(3, 6)} ${e164.slice(6)}`;
  return e164;
}
