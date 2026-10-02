import type {
  Alert,
  Comment,
  DashboardSummary,
  Incident,
  IncidentCreate,
  IncidentEvent,
  IncidentStatus,
  IncidentUpdate,
  Page,
  Postmortem,
  PostmortemInput,
  Priority,
  Service,
  ServiceCreate,
  ServiceEnvironment,
  ServiceStatus,
  ServiceUpdate,
  Severity,
  User,
  UserBrief,
} from "../types/api";

export const API_BASE_URL: string =
  import.meta.env.VITE_API_URL ?? "http://localhost:8000/api/v1";

// ---------------------------------------------------------------- token store
// localStorage keeps the session across reloads. Trade-off worth naming in an
// interview: any XSS can read it — an httpOnly cookie is safer but needs CSRF
// handling and backend changes, so it's a documented follow-up, not done here.
const TOKEN_KEY = "devpulse.token";

export const tokenStore = {
  get: (): string | null => localStorage.getItem(TOKEN_KEY),
  set: (token: string): void => localStorage.setItem(TOKEN_KEY, token),
  clear: (): void => localStorage.removeItem(TOKEN_KEY),
};

let unauthorizedHandler: (() => void) | null = null;
/** AuthContext registers a callback here so any 401 anywhere logs the user out. */
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  unauthorizedHandler = fn;
}

// ---------------------------------------------------------------- core client
export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type Params = Record<string, string | number | boolean | undefined | null>;

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  params?: Params;
  json?: unknown;
  form?: Record<string, string>;
  /** Login/register must not trigger the global 401 → logout handler. */
  skipAuthRedirect?: boolean;
}

function buildQuery(params?: Params): string {
  if (!params) return "";
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") qs.set(key, String(value));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

/** FastAPI errors are `{detail: string}` or, for 422, `{detail: [{msg, loc}, ...]}`. */
function extractDetail(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((d: { msg?: string; loc?: unknown[] }) => {
          const field = Array.isArray(d.loc) ? String(d.loc[d.loc.length - 1]) : "";
          return field ? `${field}: ${d.msg}` : (d.msg ?? "Invalid input");
        })
        .join("; ");
    }
  }
  return fallback;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = tokenStore.get();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let body: BodyInit | undefined;
  if (opts.form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(opts.form).toString();
  } else if (opts.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.json);
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}${buildQuery(opts.params)}`, {
      method: opts.method ?? "GET",
      headers,
      body,
    });
  } catch {
    throw new ApiError(0, "Can't reach the DevPulse API. Is the backend running on port 8000?");
  }

  if (res.status === 204) return undefined as T;

  const data: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    if (res.status === 401 && !opts.skipAuthRedirect) unauthorizedHandler?.();
    throw new ApiError(res.status, extractDetail(data, `Request failed (${res.status})`));
  }
  return data as T;
}

// ------------------------------------------------------------------- endpoints
export const authApi = {
  /** OAuth2PasswordRequestForm: the field is "username" but holds the email. */
  login: (email: string, password: string) =>
    request<{ access_token: string; token_type: string }>("/auth/login", {
      method: "POST",
      form: { username: email, password },
      skipAuthRedirect: true,
    }),
  register: (email: string, full_name: string, password: string) =>
    request<User>("/auth/register", {
      method: "POST",
      json: { email, full_name, password },
      skipAuthRedirect: true,
    }),
  me: () => request<User>("/users/me"),
};

export const usersApi = {
  /** Needs the small backend addition described in the Module 7 notes. */
  directory: () => request<UserBrief[]>("/users/directory"),
};

export const dashboardApi = {
  summary: () => request<DashboardSummary>("/dashboard/summary"),
};

export interface IncidentFilters {
  page?: number;
  size?: number;
  status?: IncidentStatus | "";
  severity?: Severity | "";
  priority?: Priority | "";
  service_id?: string;
  assignee_id?: string;
  search?: string;
}

export const incidentsApi = {
  list: (filters: IncidentFilters = {}) =>
    request<Page<Incident>>("/incidents/", { params: { ...filters } }),
  get: (id: string) => request<Incident>(`/incidents/${id}`),
  create: (data: IncidentCreate) =>
    request<Incident>("/incidents/", { method: "POST", json: data }),
  update: (id: string, data: IncidentUpdate) =>
    request<Incident>(`/incidents/${id}`, { method: "PATCH", json: data }),
  assign: (id: string, assignee_id: string | null) =>
    request<Incident>(`/incidents/${id}/assign`, { method: "PATCH", json: { assignee_id } }),
  changeStatus: (id: string, status: IncidentStatus) =>
    request<Incident>(`/incidents/${id}/status`, { method: "PATCH", json: { status } }),
  timeline: (id: string) => request<IncidentEvent[]>(`/incidents/${id}/timeline`),
  comments: (id: string) => request<Comment[]>(`/incidents/${id}/comments`),
  addComment: (id: string, body: string) =>
    request<Comment>(`/incidents/${id}/comments`, { method: "POST", json: { body } }),
  deleteComment: (id: string, commentId: string) =>
    request<void>(`/incidents/${id}/comments/${commentId}`, { method: "DELETE" }),
  /** Resolves to null (not an error) when no postmortem exists yet. */
  postmortem: async (id: string): Promise<Postmortem | null> => {
    try {
      return await request<Postmortem>(`/incidents/${id}/postmortem`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  },
  createPostmortem: (id: string, data: PostmortemInput) =>
    request<Postmortem>(`/incidents/${id}/postmortem`, { method: "POST", json: data }),
  updatePostmortem: (id: string, data: Partial<PostmortemInput>) =>
    request<Postmortem>(`/incidents/${id}/postmortem`, { method: "PATCH", json: data }),
};

export interface ServiceFilters {
  page?: number;
  size?: number;
  environment?: ServiceEnvironment | "";
  status?: ServiceStatus | "";
}

export const servicesApi = {
  list: (filters: ServiceFilters = {}) =>
    request<Page<Service>>("/services/", { params: { ...filters } }),
  create: (data: ServiceCreate) =>
    request<Service>("/services/", { method: "POST", json: data }),
  update: (id: string, data: ServiceUpdate) =>
    request<Service>(`/services/${id}`, { method: "PATCH", json: data }),
  remove: (id: string) => request<void>(`/services/${id}`, { method: "DELETE" }),
};

export interface AlertFilters {
  page?: number;
  size?: number;
  service_id?: string;
  severity?: Severity | "";
  processed?: boolean | "";
}

export const alertsApi = {
  list: (filters: AlertFilters = {}) =>
    request<Page<Alert>>("/alerts/", { params: { ...filters } }),
};

/**
 * WebSocket URL for the live-update feed. Resolves against the page origin so it
 * works both with an absolute VITE_API_URL (local dev: http://localhost:8000/api/v1)
 * and a relative one (production behind a reverse proxy: /api/v1) — the browser's
 * WebSocket constructor rejects relative URLs, so we can't just string-replace.
 */
export function realtimeUrl(token: string): string {
  const url = new URL(API_BASE_URL, window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  const base = url.toString().replace(/\/$/, "");
  return `${base}/ws/updates?token=${encodeURIComponent(token)}`;
}
