import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Student preferences that other screens depend on (study circles) or that a
// reminder sender will need (time, opt-ins). Stored server-side; reminders are
// off until the student turns them on, and at most one a day.

export type StudentSettings = {
  available: boolean;
  showInCircles: boolean;
  reminderEnabled: boolean;
  reminderTime: string;
  whatsappOptIn: boolean;
};

const DEFAULTS: StudentSettings = {
  available: true,
  showInCircles: false,
  reminderEnabled: false,
  reminderTime: "21:00",
  whatsappOptIn: false,
};

// student_settings arrives with the Florence migration and isn't in the
// generated types yet.
const settingsTable = () =>
  (supabaseAdmin as unknown as { from: (t: string) => ReturnType<typeof supabaseAdmin.from> }).from(
    "student_settings",
  );

export const getStudentSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StudentSettings> => {
    const userId = context.userId;
    if (!userId) throw new Error("Unauthorized");
    const { data, error } = await settingsTable()
      .select("show_in_circles, reminder_enabled, reminder_time, whatsapp_opt_in")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return { ...DEFAULTS, available: false };
    const row = data as {
      show_in_circles: boolean;
      reminder_enabled: boolean;
      reminder_time: string;
      whatsapp_opt_in: boolean;
    } | null;
    if (!row) return DEFAULTS;
    return {
      available: true,
      showInCircles: row.show_in_circles,
      reminderEnabled: row.reminder_enabled,
      reminderTime: row.reminder_time,
      whatsappOptIn: row.whatsapp_opt_in,
    };
  });

const UpdateInput = z
  .object({
    showInCircles: z.boolean(),
    reminderEnabled: z.boolean(),
    reminderTime: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/),
    whatsappOptIn: z.boolean(),
  })
  .partial();

export const updateStudentSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => UpdateInput.parse(data))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    if (!userId) throw new Error("Unauthorized");
    const patch: Record<string, unknown> = {
      user_id: userId,
      updated_at: new Date().toISOString(),
    };
    if (data.showInCircles !== undefined) patch.show_in_circles = data.showInCircles;
    if (data.reminderEnabled !== undefined) patch.reminder_enabled = data.reminderEnabled;
    if (data.reminderTime !== undefined) patch.reminder_time = data.reminderTime;
    if (data.whatsappOptIn !== undefined) patch.whatsapp_opt_in = data.whatsappOptIn;
    const { error } = await settingsTable().upsert(patch as never, { onConflict: "user_id" });
    if (error) return { ok: false as const };
    return { ok: true as const };
  });
