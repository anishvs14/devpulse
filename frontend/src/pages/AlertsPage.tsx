import { useState } from "react";
import { Link } from "react-router-dom";
import { Pagination } from "../components/Pagination";
import { SEVERITY_RAIL, SeverityBadge } from "../components/badges";
import { EmptyState, ErrorNote, PageHeader, Spinner, selectCls } from "../components/ui";
import { useDirectory } from "../context/DirectoryContext";
import { useRealtimeEvent } from "../context/RealtimeContext";
import { useLoad } from "../hooks/useLoad";
import { timeAgo } from "../lib/format";
import { alertsApi } from "../services/api";
import { SEVERITIES } from "../types/api";
import type { Severity } from "../types/api";

const PAGE_SIZE = 20;

export function AlertsPage() {
  const { services, serviceName } = useDirectory();
  const [page, setPage] = useState(1);
  const [severity, setSeverity] = useState<Severity | "">("");
  const [serviceId, setServiceId] = useState("");
  const [processed, setProcessed] = useState<"" | "true" | "false">("");

  const { data, error, loading, reload } = useLoad(
    () =>
      alertsApi.list({
        page,
        size: PAGE_SIZE,
        severity,
        service_id: serviceId,
        processed: processed === "" ? "" : processed === "true",
      }),
    [page, severity, serviceId, processed],
  );

  // Ingested → shows up as pending; processed → flips to done and links its incident.
  useRealtimeEvent((e) => {
    if (e.type === "alert_ingested" || e.type === "alert_processed") reload();
  });

  const resetPage = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  return (
    <>
      <PageHeader
        title="Alerts"
        subtitle="Raw signals from monitors. Serious ones open or join an incident automatically."
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <select className={`${selectCls} w-auto`} aria-label="Filter by severity" value={severity} onChange={(e) => resetPage(setSeverity)(e.target.value as Severity | "")}>
          <option value="">Any severity</option>
          {SEVERITIES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className={`${selectCls} w-auto`} aria-label="Filter by service" value={serviceId} onChange={(e) => resetPage(setServiceId)(e.target.value)}>
          <option value="">Any service</option>
          {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className={`${selectCls} w-auto`} aria-label="Filter by processing state" value={processed} onChange={(e) => resetPage(setProcessed)(e.target.value as "" | "true" | "false")}>
          <option value="">Processed or pending</option>
          <option value="true">Processed</option>
          <option value="false">Pending</option>
        </select>
      </div>

      {error && <ErrorNote message={error} onRetry={reload} />}
      {loading && !data ? (
        <Spinner />
      ) : data && data.items.length === 0 ? (
        <div className="rounded-lg border border-line bg-panel">
          <EmptyState title="No alerts match" hint="Send one with POST /alerts/ingest and an X-API-Key header." />
        </div>
      ) : (
        data && (
          <>
            <div className="overflow-hidden rounded-lg border border-line bg-panel">
              <ul className="divide-y divide-line">
                {data.items.map((a) => (
                  <li key={a.id} className="relative flex items-start gap-4 py-3 pl-5 pr-4">
                    <span className={`absolute inset-y-0 left-0 w-1 ${SEVERITY_RAIL[a.severity]}`} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <SeverityBadge severity={a.severity} />
                        <span className="font-mono text-sm">{a.alert_type}</span>
                        <span className="text-xs text-muted">{serviceName(a.service_id)} · from {a.source}</span>
                      </div>
                      <p className="mt-1.5 text-sm">{a.message}</p>
                    </div>
                    <div className="shrink-0 text-right text-xs text-muted">
                      <p>{timeAgo(a.received_at)}</p>
                      {a.incident_id ? (
                        <Link to={`/incidents/${a.incident_id}`} className="mt-1 inline-block text-pulse underline underline-offset-2">
                          View incident
                        </Link>
                      ) : (
                        <p className="mt-1">{a.processed ? "No incident needed" : "Pending"}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <Pagination page={data.page} size={data.size} total={data.total} onChange={setPage} />
          </>
        )
      )}
    </>
  );
}
