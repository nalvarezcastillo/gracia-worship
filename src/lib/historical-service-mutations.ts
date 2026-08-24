import type { DeleteHistoricalServiceArgs } from "@/lib/database.types";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export async function deleteHistoricalService(serviceId: number) {
  const args: DeleteHistoricalServiceArgs = { p_service_id: serviceId };
  const { error } = await createSupabaseBrowserClient().rpc("delete_historical_service", args);
  if (error) throw new Error(error.message);
}
