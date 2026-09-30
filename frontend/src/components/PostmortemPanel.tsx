import { useState } from "react";
import type { FormEvent } from "react";
import { useDirectory } from "../context/DirectoryContext";
import { useToast } from "../context/ToastContext";
import { errorMessage } from "../hooks/useLoad";
import { formatDateTime } from "../lib/format";
import { incidentsApi } from "../services/api";
import type { Postmortem, PostmortemInput } from "../types/api";
import { ErrorNote, Field, Panel, btnGhost, btnPrimary, inputCls } from "./ui";

const REQUIRED: { key: keyof PostmortemInput; label: string; hint?: string }[] = [
  { key: "summary", label: "Summary", hint: "Two or three sentences a stakeholder could read on its own." },
  { key: "impact", label: "Impact", hint: "Who or what was affected, and for how long?" },
  { key: "root_cause", label: "Root cause" },
  { key: "timeline", label: "Timeline", hint: "Key moments from detection to resolution." },
  { key: "resolution", label: "Resolution" },
];
const OPTIONAL: { key: keyof PostmortemInput; label: string }[] = [
  { key: "contributing_factors", label: "Contributing factors" },
  { key: "corrective_actions", label: "Corrective actions" },
  { key: "lessons_learned", label: "Lessons learned" },
];

const EMPTY: PostmortemInput = { summary: "", impact: "", root_cause: "", timeline: "", resolution: "" };

interface Props {
  incidentId: string;
  postmortem: Postmortem | null;
  /** Reporter, assignee or admin — mirrors the server-side can_modify rule. */
  canEdit: boolean;
  onSaved: (p: Postmortem) => void;
}

export function PostmortemPanel({ incidentId, postmortem, canEdit, onSaved }: Props) {
  const { userName } = useDirectory();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<PostmortemInput>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function startEditing() {
    setForm(postmortem ? { ...postmortem } : EMPTY);
    setError(null);
    setEditing(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    // Optional fields: send null when blank so a cleared field really clears.
    const payload: PostmortemInput = {
      summary: form.summary.trim(),
      impact: form.impact.trim(),
      root_cause: form.root_cause.trim(),
      timeline: form.timeline.trim(),
      resolution: form.resolution.trim(),
      contributing_factors: form.contributing_factors?.trim() || null,
      corrective_actions: form.corrective_actions?.trim() || null,
      lessons_learned: form.lessons_learned?.trim() || null,
    };
    try {
      const saved = postmortem
        ? await incidentsApi.updatePostmortem(incidentId, payload)
        : await incidentsApi.createPostmortem(incidentId, payload);
      onSaved(saved);
      setEditing(false);
      toast("Postmortem saved", "success");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <Panel title={postmortem ? "Edit postmortem" : "Write postmortem"}>
        <form onSubmit={onSubmit} className="space-y-4">
          {error && <ErrorNote message={error} />}
          {REQUIRED.map((f) => (
            <Field key={f.key} label={f.label} hint={f.hint}>
              <textarea className={`${inputCls} min-h-24`} required value={form[f.key] ?? ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
            </Field>
          ))}
          {OPTIONAL.map((f) => (
            <Field key={f.key} label={`${f.label} (optional)`}>
              <textarea className={`${inputCls} min-h-20`} value={form[f.key] ?? ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
            </Field>
          ))}
          <div className="flex justify-end gap-2">
            <button type="button" className={btnGhost} onClick={() => setEditing(false)}>Cancel</button>
            <button className={btnPrimary} disabled={busy}>{busy ? "Saving…" : "Save postmortem"}</button>
          </div>
        </form>
      </Panel>
    );
  }

  if (!postmortem) {
    return (
      <Panel title="Postmortem">
        <p className="text-sm text-muted">
          This incident is resolved but has no postmortem yet.
          {!canEdit && " Only the reporter, assignee or an admin can write it."}
        </p>
        {canEdit && (
          <button className={`${btnPrimary} mt-4`} onClick={startEditing}>Write postmortem</button>
        )}
      </Panel>
    );
  }

  const sections = [...REQUIRED, ...OPTIONAL].filter((f) => postmortem[f.key as keyof Postmortem]);
  return (
    <Panel
      title="Postmortem"
      action={canEdit ? <button className="text-sm text-pulse underline underline-offset-2" onClick={startEditing}>Edit</button> : undefined}
    >
      <p className="mb-4 text-xs text-muted">
        By {userName(postmortem.author_id)} · updated {formatDateTime(postmortem.updated_at)}
      </p>
      <div className="space-y-5">
        {sections.map((f) => (
          <div key={f.key}>
            <h3 className="text-sm font-semibold">{f.label}</h3>
            <p className="mt-1 max-w-prose whitespace-pre-wrap text-sm leading-relaxed text-fg/90">
              {postmortem[f.key as keyof Postmortem] as string}
            </p>
          </div>
        ))}
      </div>
    </Panel>
  );
}
