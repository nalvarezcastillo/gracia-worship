import type { ServiceStatus } from "@/lib/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ServiceSummary = {
  id: number;
  serviceDate: string | null;
  serviceName: string;
  serviceTime: string;
  status: ServiceStatus;
};

export type ServiceHubData = {
  services: ServiceSummary[];
  archived: ServiceSummary[];
  recent: ServiceSummary[];
  unscheduled: ServiceSummary[];
  upcoming: ServiceSummary[];
};

export async function getServiceHubData(): Promise<ServiceHubData> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("active_setlist")
    .select("id, service_name, service_date, service_time, status")
    .in("status", ["active", "planned", "completed", "archived"]);

  if (error) throw new Error(error.message);

  const today = toLocalDateKey(new Date());
  const services = (data ?? []).map((service) => ({
    id: service.id,
    serviceDate: service.service_date,
    serviceName: localizeDefaultServiceName(service.service_name),
    serviceTime: service.service_time,
    status: service.status as ServiceStatus,
  }));
  const scheduledUpcoming = services
    .filter((service) => (service.status === "active" || service.status === "planned") && service.serviceDate !== null && service.serviceDate >= today)
    .sort(compareScheduledAscending);

  return {
    services: [...services].sort(compareScheduledDescending),
    upcoming: scheduledUpcoming,
    unscheduled: services
      .filter((service) => (service.status === "active" || service.status === "planned") && service.serviceDate === null)
      .sort((first, second) => first.id - second.id),
    recent: services.filter((service) => service.status === "completed").sort(compareScheduledDescending),
    archived: services.filter((service) => service.status === "archived").sort(compareScheduledDescending),
  };
}

function compareScheduledAscending(first: ServiceSummary, second: ServiceSummary) {
  return (first.serviceDate ?? "9999-12-31").localeCompare(second.serviceDate ?? "9999-12-31")
    || first.serviceTime.localeCompare(second.serviceTime)
    || first.id - second.id;
}

function compareScheduledDescending(first: ServiceSummary, second: ServiceSummary) {
  return (second.serviceDate ?? "0000-01-01").localeCompare(first.serviceDate ?? "0000-01-01")
    || second.serviceTime.localeCompare(first.serviceTime)
    || second.id - first.id;
}

function toLocalDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localizeDefaultServiceName(value: string) {
  return value === "Saturday Service" ? "Servicio del Sábado" : value;
}
