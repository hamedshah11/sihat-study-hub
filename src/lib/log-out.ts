import { supabase } from "@/integrations/supabase/client";
import { removeAllDownloads } from "@/lib/downloads";
import { forgetStoredSession, isOffline } from "@/lib/offline-session";

/**
 * Log out on this phone: remove the student's downloads first, so a shared
 * phone keeps nothing of their account, then end the session. With no
 * signal the server can't be told, so the session is forgotten on the phone.
 */
export async function logOut(userId: string | null) {
  try {
    await removeAllDownloads(userId);
  } catch (error) {
    console.error("Couldn't remove downloads on log out", error);
  }
  if (isOffline()) {
    forgetStoredSession();
    return;
  }
  const { error } = await supabase.auth.signOut();
  if (!error) return;
  const { error: localError } = await supabase.auth.signOut({ scope: "local" });
  if (localError) forgetStoredSession();
}
