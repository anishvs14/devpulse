// Mirrors backend/app/models/enums.py and backend/app/schemas/*.py.
// If a backend schema changes, this is the one file to update.

export type UserRole = "ADMIN" | "ENGINEER" | "VIEWER";
export type ServiceEnvironment = "PRODUCTION" | "STAGING" | "DEVELOPMENT";
export type ServiceStatus = "HEALTHY" | "DEGRADED" | "DOWN" | "UNKNOWN";
export type IncidentStatus =
  | "OPEN"
  | "INVESTIGATING"
  | "IDENTIFIED"
  | "MITIGATING"
  | "RESOLVED"
  | "CLOSED";
export type Severity = "SEV1" | "SEV2" | "SEV3" | "SEV4";
export type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type IncidentEventType =
  | "CREATED"
  | "STATUS_CHANGE"
  | "SEVERITY_CHANGE"
  | "PRIORITY_CHANGE"
  | "ASSIGNMENT_CHANGE"
  | "COMMENT_ADDED";

export const SEVERITIES: Severity[] = ["SEV1", "SEV2", "SEV3", "SEV4"];
export const PRIORITIES: Priority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
export const STATUSES: IncidentStatus[] = [
  "OPEN",
  "INVESTIGATING",
  "IDENTIFIED",
  "MITIGATING",
  "RESOLVED",
  "CLOSED",
];
export const ENVIRONMENTS: ServiceEnvironment[] = ["PRODUCTION", "STAGING", "DEVELOPMENT"];
export const SERVICE_STATUSES: ServiceStatus[] = ["HEALTHY", "DEGRADED", "DOWN", "UNKNOWN"];

/** Mirror of incident_service.VALID_TRANSITIONS — used only to decide which
 *  buttons to show. The server is still the authority and re-validates. */
export const NEXT_STATUSES: Record<IncidentStatus, IncidentStatus[]> = {
  OPEN: ["INVESTIGATING"],
  INVESTIGATING: ["IDENTIFIED"],
  IDENTIFIED: ["MITIGATING"],
  MITIGATING: ["RESOLVED"],
  RESOLVED: ["CLOSED", "INVESTIGATING"],
  CLOSED: [],
};

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Minimal public shape from GET /users/directory (id → display name). */
export interface UserBrief {
  id: string;
  full_name: string;
  role: UserRole;
}

export interface Service {
  id: string;
  name: string;
  description: string | null;
  owner_team: string;
  environment: ServiceEnvironment;
  health_check_url: string | null;
  status: ServiceStatus;
  created_at: string;
  updated_at: string;
}

export interface ServiceCreate {
  name: string;
  description?: string | null;
  owner_team: string;
  environment: ServiceEnvironment;
  health_check_url?: string | null;
}

export type ServiceUpdate = Partial<ServiceCreate> & { status?: ServiceStatus };

export interface Incident {
  id: string;
  title: string;
  description: string;
  service_id: string;
  reporter_id: string;
  assignee_id: string | null;
  severity: Severity;
  priority: Priority;
  status: IncidentStatus;
  acknowledged_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface IncidentCreate {
  title: string;
  description: string;
  service_id: string;
  severity: Severity;
  priority: Priority;
}

export type IncidentUpdate = Partial<
  Pick<IncidentCreate, "title" | "description" | "severity" | "priority">
>;

export interface IncidentEvent {
  id: string;
  incident_id: string;
  actor_id: string | null;
  event_type: IncidentEventType;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

export interface Comment {
  id: string;
  incident_id: string;
  author_id: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface Alert {
  id: string;
  service_id: string;
  incident_id: string | null;
  severity: Severity;
  alert_type: string;
  message: string;
  source: string;
  alert_metadata: Record<string, unknown> | null;
  received_at: string;
  processed: boolean;
}

export interface Postmortem {
  id: string;
  incident_id: string;
  author_id: string;
  summary: string;
  impact: string;
  root_cause: string;
  timeline: string;
  resolution: string;
  contributing_factors: string | null;
  corrective_actions: string | null;
  lessons_learned: string | null;
  created_at: string;
  updated_at: string;
}

export interface PostmortemInput {
  summary: string;
  impact: string;
  root_cause: string;
  timeline: string;
  resolution: string;
  contributing_factors?: string | null;
  corrective_actions?: string | null;
  lessons_learned?: string | null;
}

export interface DashboardSummary {
  active_incidents: number;
  incidents_by_status: Record<string, number>;
  incidents_by_severity: Record<string, number>;
  avg_seconds_to_acknowledge: number | null;
  avg_seconds_to_resolve: number | null;
}

/** Messages published by the backend on Redis "devpulse:realtime" and relayed over the WebSocket. */
export type RealtimeEvent =
  | { type: "alert_ingested"; data: { alert_id: string; service_id: string; severity: Severity; alert_type: string } }
  | { type: "alert_processed"; data: { alert_id: string; service_id: string; incident_id: string | null } }
  | { type: "incident_created"; data: { incident_id: string; service_id: string; severity: Severity; title: string } }
  | { type: "service_status_changed"; data: { service_id: string; status: ServiceStatus } };
