import { MAILPIT_URL } from "./env.ts";

// Reads sign-in codes from the local Supabase mail catcher (Mailpit). Nothing
// is ever sent to a real inbox.

type MailSummary = { ID: string; Created: string };

/** The 6-digit code from the newest email to `email` sent after `since`. */
export async function latestCode(email: string, since: Date, timeoutMs = 15_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const search = await fetch(
      `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
    );
    const { messages } = (await search.json()) as { messages: MailSummary[] };
    const fresh = messages.find((m) => Date.parse(m.Created) >= since.getTime() - 1000);
    if (fresh) {
      const message = await fetch(`${MAILPIT_URL}/api/v1/message/${fresh.ID}`);
      const { Text } = (await message.json()) as { Text: string };
      const code = Text.match(/\b(\d{6})\b/)?.[1];
      if (code) return code;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`No sign-in code reached ${email} within ${timeoutMs / 1000} s`);
}
