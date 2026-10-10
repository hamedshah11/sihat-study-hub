import { seed } from "./seed.ts";

/** Seed the local stack before the run (idempotent). */
export default async function globalSetup() {
  await seed();
}
