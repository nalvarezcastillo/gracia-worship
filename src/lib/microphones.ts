import { createSupabaseServerClient } from "@/lib/supabase/server";

export type MicrophoneAssignment = {
  id: string;
  leader_name: string;
  microphone_name: string;
  position: number;
};

export type MicrophoneAssignmentsResult = {
  assignments: MicrophoneAssignment[];
  error: string | null;
};

export async function getMicrophoneAssignmentsResult(): Promise<MicrophoneAssignmentsResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("microphone_assignments")
      .select("id, leader_name, microphone_name, position")
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Unable to load microphone assignments:", error.message);
      return {
        assignments: [],
        error: error.code === "PGRST205" || error.code === "42P01"
          ? "La tabla de micrófonos todavía no existe en Supabase. Ejecuta supabase/microphone_assignments.sql."
          : "No se pudieron cargar las asignaciones de micrófonos.",
      };
    }

    return { assignments: (data ?? []) as MicrophoneAssignment[], error: null };
  } catch (error) {
    console.error("Unable to load microphone assignments:", error);
    return { assignments: [], error: "No se pudieron cargar las asignaciones de micrófonos." };
  }
}

export async function getMicrophoneAssignments(): Promise<MicrophoneAssignment[]> {
  return (await getMicrophoneAssignmentsResult()).assignments;
}
