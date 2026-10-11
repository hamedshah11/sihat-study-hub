import { createContext, useContext } from "react";

/**
 * The signed-in student's id, provided by the authenticated layout. Offline
 * it comes from the session stored on the phone (see `offline-session.ts`).
 * Downloads are read and written only for this id.
 */
export const SessionUserContext = createContext<string | null>(null);

export function useSessionUserId() {
  return useContext(SessionUserContext);
}
