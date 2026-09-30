import { useRef } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SEVERITY_HEX, SeverityBadge, ServiceStatusDot, StatusBadge } from "../components/badges";
import { ErrorNote, PageHeader, Panel, Spinner, EmptyState } from "../components/ui";
import { useDirectory } from "../context/DirectoryContext";
import { useRealtimeEvent } from "../context/RealtimeContext";
import { useLoad } from "../hooks/useLoad";
import { formatDuration, timeAgo, titleCase } from "../lib/format";
import { dashboardApi, incidentsApi } from "../services/api";
import { SEVERITIES, STATUSES } from "../types/api";

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 font-mono text-3xl font-medium">{value}</p>
      <p className="mt-1 text-xs text-muted">{note}</p>
    </div>
  );
}

const chartTooltip = {
  contentStyle: { background: "#222a36", border: "1px solid #2d3644", borderRadius: 6, fontSize: 12 },
  cursor: { fill: "rgba(255,255,255,0.04)" },
};

export function DashboardPage() {
  const summary = useLoad(() => dashboardApi.summary(), []);
  const latest = useLoad(() => incidentsApi.list({ size: 6 }), []);
  const { services, serviceName } = useDirectory();

  // Live: an alert becoming an incident changes every number on this page.
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useRealtimeEvent((e) => {
    if (e.type === "incident_created" || e.type === "alert_processed") {
      clearTimeout(debounce.current);
      debounce.current = setTimeout(() => {
        summary.reload();
        latest.reload();
      }, 400);
    }
  });

  if (summary.loading && !summary.data) return <Spinner />;
  if (summary.error && !summary.data) return <ErrorNote message={summary.error} onRetry={summary.reload} />;
  const s = summary.data!;

  const statusData = STATUSES.map((st) => ({ name: titleCase(st), count: s.incidents_by_status[st] ?? 0 }));
  const severityData = SEVERITIES.map((sv) => ({ name: sv, count: s.incidents_by_severity[sv] ?? 0 }));
  const down = services.filter((x) => x.status === "DOWN" || x.status === "DEGRADED");

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Live view of incident load and response times." />

      <div className="grid gap-4 sm:grid-cols-3">
        <Metric label="Active incidents" value={String(s.active_incidents)} note="Anything not yet resolved or closed" />
        <Metric label="Avg. time to acknowledge" value={formatDuration(s.avg_seconds_to_acknowledge)} note="From creation to first response" />
        <Metric label="Avg. time to resolve" value={formatDuration(s.avg_seconds_to_resolve)} note="From creation to resolution" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Incidents by status">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusData} margin={{ left: -20, top: 4 }}>
                <XAxis dataKey="name" tick={{ fill: "#8b95a5", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: "#8b95a5", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip {...chartTooltip} />
                <Bar dataKey="count" name="Incidents" fill="#4cc9c0" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Incidents by severity">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={severityData} margin={{ left: -20, top: 4 }}>
                <XAxis dataKey="name" tick={{ fill: "#8b95a5", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: "#8b95a5", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip {...chartTooltip} />
                <Bar dataKey="count" name="Incidents" radius={[3, 3, 0, 0]}>
                  {severityData.map((d) => (
                    <Cell key={d.name} fill={SEVERITY_HEX[d.name as keyof typeof SEVERITY_HEX]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Panel
          title="Latest incidents"
          className="lg:col-span-3"
          action={<Link to="/incidents" className="text-sm text-pulse underline underline-offset-2">View all</Link>}
        >
          {latest.data && latest.data.items.length === 0 ? (
            <EmptyState title="No incidents yet" hint="Create one from the Incidents page, or ingest an alert." />
          ) : (
            <ul className="divide-y divide-line">
              {latest.data?.items.map((i) => (
                <li key={i.id} className="flex items-center gap-3 py-2.5">
                  <SeverityBadge severity={i.severity} />
                  <Link to={`/incidents/${i.id}`} className="min-w-0 flex-1 truncate hover:text-pulse">
                    {i.title}
                    <span className="ml-2 text-xs text-muted">{serviceName(i.service_id)}</span>
                  </Link>
                  <StatusBadge status={i.status} />
                  <span className="hidden w-16 text-right text-xs text-muted sm:block">{timeAgo(i.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Services needing attention" className="lg:col-span-2">
          {down.length === 0 ? (
            <p className="text-sm text-muted">
              {services.length === 0 ? "No services registered yet." : "All services are healthy or unchecked."}
            </p>
          ) : (
            <ul className="space-y-2.5">
              {down.map((svc) => (
                <li key={svc.id} className="flex items-center justify-between gap-3">
                  <span className="truncate">{svc.name}</span>
                  <ServiceStatusDot status={svc.status} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
