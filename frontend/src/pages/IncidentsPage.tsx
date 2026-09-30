import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { PriorityBadge, SEVERITY_RAIL, SeverityBadge, StatusBadge } from "../components/badges";
import { CreateIncidentModal } from "../components/CreateIncidentModal";
import { Pagination } from "../components/Pagination";
import { EmptyState, ErrorNote, PageHeader, Spinner, btnPrimary, inputCls, selectCls } from "../components/ui";
import { canWrite, useAuth } from "../context/AuthContext";
import { useDirectory } from "../context/DirectoryContext";
import { useRealtimeEvent } from "../context/RealtimeContext";
import { useToast } from "../context/ToastContext";
import { useLoad } from "../hooks/useLoad";
import { timeAgo, titleCase } from "../lib/format";
import { incidentsApi } from "../services/api";
import { PRIORITIES, SEVERITIES, STATUSES } from "../types/api";
import type { IncidentStatus, Priority, Severity } from "../types/api";

const PAGE_SIZE = 15;

export function IncidentsPage() {
  const { user } = useAuth();
  const { services, serviceName, userName } = useDirectory();
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);

  // Filters live in the URL: refresh-safe, back-button-safe, shareable.
  const page = Number(params.get("page") ?? "1") || 1;
  const status = (params.get("status") ?? "") as IncidentStatus | "";
  const severity = (params.get("severity") ?? "") as Severity | "";
  const priority = (params.get("priority") ?? "") as Priority | "";
  const serviceId = params.get("service_id") ?? "";
  const search = params.get("search") ?? "";

  // The search box keeps its own state and only writes to the URL after a pause.
  const [searchText, setSearchText] = useState(search);
  useEffect(() => {
    if (searchText === search) return;
    const t = setTimeout(() => setFilter("search", searchText), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText]);

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page"); // any filter change goes back to page 1
    setParams(next, { replace: true });
  }
  function setPage(p: number) {
    const next = new URLSearchParams(params);
    next.set("page", String(p));
    setParams(next);
  }

  const { data, error, loading, reload } = useLoad(
    () =>
      incidentsApi.list({
        page,
        size: PAGE_SIZE,
        status,
        severity,
        priority,
        service_id: serviceId,
        search: search.trim(),
      }),
    [page, status, severity, priority, serviceId, search],
  );

  useRealtimeEvent((e) => {
    if (e.type === "incident_created") reload();
  });

  const hasFilters = Boolean(status || severity || priority || serviceId || search);

  return (
    <>
      <PageHeader
        title="Incidents"
        subtitle="Everything reported by people or opened automatically from alerts."
        action={
          canWrite(user) ? (
            <button className={btnPrimary} onClick={() => setCreating(true)}>Report incident</button>
          ) : undefined
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <input
          className={`${inputCls} lg:col-span-2`}
          type="search"
          placeholder="Search titles and descriptions…"
          aria-label="Search incidents"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
        <select className={selectCls} aria-label="Filter by status" value={status} onChange={(e) => setFilter("status", e.target.value)}>
          <option value="">Any status</option>
          {STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
        </select>
        <select className={selectCls} aria-label="Filter by severity" value={severity} onChange={(e) => setFilter("severity", e.target.value)}>
          <option value="">Any severity</option>
          {SEVERITIES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className={selectCls} aria-label="Filter by priority" value={priority} onChange={(e) => setFilter("priority", e.target.value)}>
          <option value="">Any priority</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{titleCase(p)}</option>)}
        </select>
        <select className={`${selectCls} lg:col-span-2`} aria-label="Filter by service" value={serviceId} onChange={(e) => setFilter("service_id", e.target.value)}>
          <option value="">Any service</option>
          {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {hasFilters && (
          <button
            className="text-left text-sm text-muted underline underline-offset-2 hover:text-fg"
            onClick={() => { setSearchText(""); setParams({}, { replace: true }); }}
          >
            Clear filters
          </button>
        )}
      </div>

      {error && <ErrorNote message={error} onRetry={reload} />}
      {loading && !data ? (
        <Spinner />
      ) : data && data.items.length === 0 ? (
        <div className="rounded-lg border border-line bg-panel">
          <EmptyState
            title={hasFilters ? "No incidents match these filters" : "No incidents yet"}
            hint={hasFilters ? "Try clearing a filter." : "Report one, or ingest an alert to see auto-creation."}
          />
        </div>
      ) : (
        data && (
          <>
            <div className="overflow-hidden rounded-lg border border-line bg-panel">
              <ul className="divide-y divide-line">
                {data.items.map((i) => (
                  <li key={i.id} className="relative flex items-center gap-4 py-3 pl-5 pr-4 hover:bg-raised/50">
                    <span className={`absolute inset-y-0 left-0 w-1 ${SEVERITY_RAIL[i.severity]}`} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <Link to={`/incidents/${i.id}`} className="block truncate font-medium hover:text-pulse">
                        {i.title}
                      </Link>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {serviceName(i.service_id)} · {userName(i.assignee_id)} · {timeAgo(i.created_at)}
                      </p>
                    </div>
                    <div className="hidden items-center gap-2 sm:flex">
                      <PriorityBadge priority={i.priority} />
                      <SeverityBadge severity={i.severity} />
                    </div>
                    <StatusBadge status={i.status} />
                  </li>
                ))}
              </ul>
            </div>
            <Pagination page={data.page} size={data.size} total={data.total} onChange={setPage} />
          </>
        )
      )}

      {creating && (
        <CreateIncidentModal
          onClose={() => setCreating(false)}
          onCreated={(created) => {
            toast("Incident created", "success");
            navigate(`/incidents/${created.id}`);
          }}
        />
      )}
    </>
  );
}
