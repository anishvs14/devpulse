import { useState } from "react";
import type { FormEvent } from "react";
import { useDirectory } from "../context/DirectoryContext";
import { errorMessage } from "../hooks/useLoad";
import { titleCase } from "../lib/format";
import { incidentsApi } from "../services/api";
import { PRIORITIES, SEVERITIES } from "../types/api";
import type { Incident, Priority, Severity } from "../types/api";
import { Modal } from "./Modal";
import { ErrorNote, Field, btnGhost, btnPrimary, inputCls, selectCls } from "./ui";

export function CreateIncidentModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (incident: Incident) => void;
}) {
  const { services } = useDirectory();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [severity, setSeverity] = useState<Severity>("SEV3");
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await incidentsApi.create({
        title: title.trim(),
        description: description.trim(),
        service_id: serviceId,
        severity,
        priority,
      });
      onCreated(created);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Modal title="Report an incident" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <ErrorNote message={error} />}
        <Field label="Title">
          <input className={inputCls} required maxLength={255} autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Checkout API returning 502s" />
        </Field>
        <Field label="What's happening?">
          <textarea className={`${inputCls} min-h-28`} required value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Affected service" hint={services.length === 0 ? "No services yet — an admin needs to add one first." : undefined}>
          <select className={selectCls} required value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
            <option value="" disabled>Select a service…</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.environment.toLowerCase()})</option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Severity" hint="Technical impact">
            <select className={selectCls} value={severity} onChange={(e) => setSeverity(e.target.value as Severity)}>
              {SEVERITIES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Priority" hint="How fast we respond">
            <select className={selectCls} value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{titleCase(p)}</option>)}
            </select>
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={btnGhost} onClick={onClose}>Cancel</button>
          <button className={btnPrimary} disabled={busy || !serviceId}>{busy ? "Creating…" : "Create incident"}</button>
        </div>
      </form>
    </Modal>
  );
}
