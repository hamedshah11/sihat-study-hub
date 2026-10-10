// Runs once before the tests: checks the local stack is up and seeds it.
import { e2eEnv } from "./support/env.ts";
import { seed } from "./seed.ts";

export default async function globalSetup() {
  const env = e2eEnv();
  try {
    const res = await fetch(`${env.supabaseUrl}/auth/v1/health`, {
      headers: { apikey: env.anonKey },
    });
    if (!res.ok) throw new Error(`auth health ${res.status}`);
  } catch (error) {
    throw new Error(
      `[e2e] Local Supabase isn't answering at ${env.supabaseUrl}. ` +
        `Start it with \`npm run e2e:supabase\`. (${String(error)})`,
    );
  }
  await seed();
}
