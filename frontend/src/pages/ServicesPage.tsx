import { useState } from "react";
import type { FormEvent } from "react";
import { Modal } from "../components/Modal";
import { Pagination } from "../components/Pagination";
import { ServiceStatusDot } from "../components/badges";
import { EmptyState, ErrorNote, Field, PageHeader, Spinner, btnGhost, btnPrimary, inputCls, selectCls } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useDirectory } from "../context/DirectoryContext";
import { useRealtimeEvent } from "../context/RealtimeContext";
import { useToast } from "../context/ToastContext";
import { errorMessage, useLoad } from "../hooks/useLoad";
import { titleCase } from "../lib/format";
import { servicesApi } from "../services/api";
import { ENVIRONMENTS, SERVICE_STATUSES } from "../types/api";
import type { Service, ServiceEnvironment, ServiceStatus } from "../types/api";

const PAGE_SIZE = 12;

export function ServicesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const { refreshServices } = useDirectory();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [environment, setEnvironment] = useState<ServiceEnvironment | "">("");
  const [status, setStatus] = useState<ServiceStatus | "">("");
  const [editing, setEditing] = useState<Service | "new" | null>(null);

  const { data, error, loading, reload } = useLoad(
    () => servicesApi.list({ page, size: PAGE_SIZE, environment, status }),
    [page, environment, status],
  );

  // The worker changes service health automatically when alerts arrive.
  useRealtimeEvent((e) => {
    if (e.type === "service_status_changed") reload();
  });

  async function remove(service: Service) {
    if (!window.confirm(`Delete "${service.name}"? This can't be undone.`)) return;
    try {
      await servicesApi.remove(service.id);
      toast(`Deleted ${service.name}`, "success");
      reload();
      void refreshServices();
    } catch (err) {
      // 409 when incidents reference it — the API's message explains why.
      toast(errorMessage(err), "error");
    }
  }

  return (
    <>
      <PageHeader
        title="Services"
        subtitle="Everything that can break. Health updates automatically when alerts arrive."
        action={isAdmin ? <button className={btnPrimary} onClick={() => setEditing("new")}>Add service</button> : undefined}
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <select className={`${selectCls} w-auto`} aria-label="Filter by environment" value={environment} onChange={(e) => { setEnvironment(e.target.value as ServiceEnvironment | ""); setPage(1); }}>
          <option value="">Any environment</option>
          {ENVIRONMENTS.map((e) => <option key={e} value={e}>{titleCase(e)}</option>)}
        </select>
        <select className={`${selectCls} w-auto`} aria-label="Filter by status" value={status} onChange={(e) => { setStatus(e.target.value as ServiceStatus | ""); setPage(1); }}>
          <option value="">Any status</option>
          {SERVICE_STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
        </select>
      </div>

      {error && <ErrorNote message={error} onRetry={reload} />}
      {loading && !data ? (
        <Spinner />
      ) : data && data.items.length === 0 ? (
        <div className="rounded-lg border border-line bg-panel">
          <EmptyState
            title="No services found"
            hint={isAdmin ? "Add your first service to start tracking incidents against it." : "An admin needs to register services first."}
          />
        </div>
      ) : (
        data && (
          <>
            <div className="overflow-x-auto rounded-lg border border-line bg-panel">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-line text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Service</th>
                    <th className="px-4 py-3 font-medium">Environment</th>
                    <th className="px-4 py-3 font-medium">Owner team</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    {isAdmin && <th className="px-4 py-3" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.items.map((s) => (
                    <tr key={s.id}>
                      <td className="px-4 py-3">
                        <p className="font-medium">{s.name}</p>
                        {s.description && <p className="mt-0.5 max-w-xs truncate text-xs text-muted">{s.description}</p>}
                      </td>
                      <td className="px-4 py-3">{titleCase(s.environment)}</td>
                      <td className="px-4 py-3">{s.owner_team}</td>
                      <td className="px-4 py-3"><ServiceStatusDot status={s.status} /></td>
                      {isAdmin && (
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <button className="mr-4 text-pulse underline underline-offset-2" onClick={() => setEditing(s)}>Edit</button>
                          <button className="text-muted underline underline-offset-2 hover:text-sev1" onClick={() => remove(s)}>Delete</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={data.page} size={data.size} total={data.total} onChange={setPage} />
          </>
        )
      )}

      {editing && (
        <ServiceModal
          service={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
            void refreshServices();
          }}
        />
      )}
    </>
  );
}

function ServiceModal({
  service,
  onClose,
  onSaved,
}: {
  service: Service | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(service?.name ?? "");
  const [description, setDescription] = useState(service?.description ?? "");
  const [ownerTeam, setOwnerTeam] = useState(service?.owner_team ?? "");
  const [environment, setEnvironment] = useState<ServiceEnvironment>(service?.environment ?? "PRODUCTION");
  const [healthUrl, setHealthUrl] = useState(service?.health_check_url ?? "");
  const [status, setStatus] = useState<ServiceStatus>(service?.status ?? "UNKNOWN");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const base = {
      name: name.trim(),
      description: description.trim() || null,
      owner_team: ownerTeam.trim(),
      environment,
      health_check_url: healthUrl.trim() || null,
    };
    try {
      if (service) await servicesApi.update(service.id, { ...base, status });
      else await servicesApi.create(base);
      toast(service ? "Service updated" : "Service added", "success");
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Modal title={service ? `Edit ${service.name}` : "Add a service"} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <ErrorNote message={error} />}
        <Field label="Name">
          <input className={inputCls} required maxLength={150} autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="payments-api" />
        </Field>
        <Field label="Description (optional)">
          <textarea className={`${inputCls} min-h-20`} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Owner team">
            <input className={inputCls} required maxLength={150} value={ownerTeam} onChange={(e) => setOwnerTeam(e.target.value)} />
          </Field>
          <Field label="Environment">
            <select className={selectCls} value={environment} onChange={(e) => setEnvironment(e.target.value as ServiceEnvironment)}>
              {ENVIRONMENTS.map((x) => <option key={x} value={x}>{titleCase(x)}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Health check URL (optional)">
          <input className={inputCls} value={healthUrl} onChange={(e) => setHealthUrl(e.target.value)} placeholder="https://…/health" />
        </Field>
        {service && (
          <Field label="Status" hint="Normally set automatically from alerts; override it here if needed.">
            <select className={selectCls} value={status} onChange={(e) => setStatus(e.target.value as ServiceStatus)}>
              {SERVICE_STATUSES.map((x) => <option key={x} value={x}>{titleCase(x)}</option>)}
            </select>
          </Field>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className={btnGhost} onClick={onClose}>Cancel</button>
          <button className={btnPrimary} disabled={busy}>{busy ? "Saving…" : service ? "Save changes" : "Add service"}</button>
        </div>
      </form>
    </Modal>
  );
}
