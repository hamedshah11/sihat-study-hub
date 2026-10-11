import { describe, expect, it } from "vitest";
import { sessionStorageKey, userIdFromStoredSession } from "./offline-session";

const USER = "e2e00008-0000-4000-8000-000000000004";
const base64url = (value: object) =>
  Buffer.from(JSON.stringify(value)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
const jwt = (sub: string) => `${base64url({ alg: "HS256" })}.${base64url({ sub })}.signature`;

describe("the session stored on the phone", () => {
  it("is found under supabase-js's storage key", () => {
    expect(sessionStorageKey("https://abcdefgh.supabase.co")).toBe("sb-abcdefgh-auth-token");
    expect(sessionStorageKey("http://127.0.0.1:54321")).toBe("sb-127-auth-token");
  });

  it("gives the user id of an expired session, so offline students stay signed in", () => {
    const stored = JSON.stringify({
      access_token: jwt(USER),
      refresh_token: "refresh",
      expires_at: 1_700_000_000,
      user: { id: USER },
    });
    expect(userIdFromStoredSession(stored)).toBe(USER);
  });

  it("reads the id from the access token when the user isn't stored with it", () => {
    const stored = JSON.stringify({ access_token: jwt(USER), refresh_token: "refresh" });
    expect(userIdFromStoredSession(stored)).toBe(USER);
  });

  it("is not a session without a refresh token, or when it isn't JSON", () => {
    expect(userIdFromStoredSession(JSON.stringify({ user: { id: USER } }))).toBeNull();
    expect(userIdFromStoredSession("not json")).toBeNull();
    expect(userIdFromStoredSession(null)).toBeNull();
    expect(
      userIdFromStoredSession(JSON.stringify({ refresh_token: "r", access_token: "bad" })),
    ).toBeNull();
  });
});
