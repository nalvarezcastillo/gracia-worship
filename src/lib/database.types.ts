export type SongRecord = {
  id: string;
  title: string;
  artist: string;
  key: string;
  bpm: number;
  time_signature: string | null;
  duration: string;
  cover_url: string;
  audio_url: string;
  sheet_url: string;
  video_url: string;
  lyrics: string;
  notes: string;
  favorite: boolean;
  created_at: string;
};

export type SongSummary = Pick<
  SongRecord,
  "id" | "title" | "artist" | "key" | "bpm" | "time_signature" | "duration" | "favorite"
> & {
  cover: string;
};

export type ServiceStatus = "active" | "planned" | "completed" | "archived";

export type ActiveSetlistRow = {
  id: number;
  service_name: string;
  service_date: string | null;
  service_time: string;
  song_ids: string[];
  leader_notes: string | null;
  status: ServiceStatus;
  updated_at: string;
};

export type ServiceTeamAssignmentRow = {
  id: string;
  service_id: number;
  team_member_id: string | null;
  person_name: string;
  role_name: string;
  microphone_name: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type ServiceTeamAssignmentResourceRow = {
  id: string;
  service_id: number;
  assignment_id: string;
  resource_id: string;
  created_at: string;
};

export type SetServiceTeamAssignmentResourcesArgs = {
  p_assignment_id: string;
  p_resource_ids: string[];
};

export type CreateServicePlanArgs = {
  p_service_name: string;
  p_service_date: string;
  p_service_time: string;
};

export type DuplicateServicePlanArgs = CreateServicePlanArgs & {
  p_source_service_id: number;
  p_copy_order?: boolean;
  p_copy_team?: boolean;
};

export type DeletePlannedServiceArgs = {
  p_service_id: number;
};

export type ServicePlanRpcResult = number;

export type ServiceLifecycleRpcArgs = {
  p_service_id: number;
};

export type ArchiveCompletedServiceArgs = ServiceLifecycleRpcArgs;

export type CompleteLiveServiceAndAdvanceResult = {
  completed_service_id: number;
  promotion_status: "promoted" | "none" | "ambiguous" | "malformed_completed_schedule";
  promoted_service_id: number | null;
};

export type SongKeyRow = {
  id: string;
  song_id: string;
  key_name: string;
  audio_url: string | null;
  sheet_url: string | null;
  sort_order: number;
  created_at: string;
};

export type ServiceSongSettingRow = {
  service_id: number;
  service_item_id: string;
  song_id: string;
  key_override: string;
  created_at: string;
  updated_at: string;
};

export type ServiceItemNoteRow = {
  service_id: number;
  service_item_id: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type SetServiceSongKeyOverrideArgs = {
  p_service_id: number;
  p_service_item_id: string;
  p_song_id: string;
  p_key_override: string | null;
};

export type SongStemRow = {
  id: string;
  song_key_id: string;
  name: string;
  storage_path: string;
  sort_order: number;
  mime_type: string | null;
  file_size_bytes: number | null;
  created_at: string;
};
