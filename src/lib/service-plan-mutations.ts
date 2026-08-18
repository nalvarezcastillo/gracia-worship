import type { CreateServicePlanArgs, DeletePlannedServiceArgs, DuplicateServicePlanArgs, ServicePlanRpcResult } from "@/lib/database.types";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export async function createServicePlan(args: CreateServicePlanArgs): Promise<ServicePlanRpcResult> {
  const { data, error } = await createSupabaseBrowserClient().rpc("create_service_plan", args);
  if (error) throw new Error(error.message);
  if (typeof data !== "number") throw new Error("El servidor no devolvió el nuevo servicio.");
  return data;
}

export async function duplicateServicePlan(args: DuplicateServicePlanArgs): Promise<ServicePlanRpcResult> {
  const { data, error } = await createSupabaseBrowserClient().rpc("duplicate_service_plan", args);
  if (error) throw new Error(error.message);
  if (typeof data !== "number") throw new Error("El servidor no devolvió el servicio duplicado.");
  return data;
}

export async function deletePlannedService(args: DeletePlannedServiceArgs) {
  const { error } = await createSupabaseBrowserClient().rpc("delete_planned_service", args);
  if (error) throw new Error(error.message);
}
