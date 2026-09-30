import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { PriorityBadge, SEVERITY_RAIL, SeverityBadge, StatusBadge } from "../components/badges";
import { Modal } from "../components/Modal";
import { PostmortemPanel } from "../components/PostmortemPanel";
import { EmptyState, ErrorNote, Field, Panel, Spinner, btnGhost, btnPrimary, inputCls, selectCls } from "../components/ui";
import { canWrite, useAuth } from "../context/AuthContext";
import { useDirectory } from "../context/DirectoryContext";
import { useToast } from "../context/ToastContext";
import { errorMessage, useLoad } from "../hooks/useLoad";
import { formatDateTime, timeAgo, titleCase } from "../lib/format";
import { ApiError, incidentsApi } from "../services/api";
import { NEXT_STATUSES, PRIORITIES, SEVERITIES, STATUSES } from "../types/api";
import type { Incident, IncidentEvent, IncidentStatus, Priority, Severity } from "../types/api";

const ACTION_LABEL: Record<string, string> = {
  "OPEN>INVESTIGATING": "Start investigating",
  "INVESTIGATING>IDENTIFIED": "Mark cause identified",
  "IDENTIFIED>MITIGATING": "Start mitigation",
  "MITIGATING>RESOLVED": "Mark resolved",
  "RESOLVED>CLOSED": "Close incident",
  "RESOLVED>INVESTIGATING": "Reopen investigation",
};

export function IncidentDetailPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const { serviceName, userName, users } = useDirectory();
  const toast = useToast();

  const incident = useLoad(() => incidentsApi.get(id), [id]);
  const comments = useLoad(() => incidentsApi.comments(id), [id]);
  const timeline = useLoad(() => incidentsApi.timeline(id), [id]);
  const inc = incident.data;
  const postmortemEligible = inc?.status === "RESOLVED" || inc?.status === "CLOSED";
  const postmortem = useLoad(
    () => (postmortemEligible ? incidentsApi.postmortem(id) : Promise.resolve(null)),
    [id, postmortemEligible],
  );

  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);

  if (incident.loading && !inc) return <Spinner />;
  if (incident.error && !inc) {
    const notFound = incident.error.toLowerCase().includes("not found");
    return notFound ? (
      <EmptyState title="Incident not found" hint="It may have been removed, or the link is wrong." />
    ) : (
      <ErrorNote message={incident.error} onRetry={incident.reload} />
    );
  }
  if (!inc) return null;

  const writer = canWrite(user);
  // Same rule as incident_service.can_modify on the server: reporter, assignee, or admin.
  const canModify = user?.role === "ADMIN" || user?.id === inc.reporter_id || user?.id === inc.assignee_id;

  function applyUpdate(updated: Incident) {
    incident.setData(updated);
    timeline.reload();
  }

  async function run(action: () => Promise<Incident>, success: string) {
    setBusy(true);
    try {
      applyUpdate(await action());
      toast(success, "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }

  async function submitComment(e: FormEvent) {
    e.preventDefault();
    setCommentError(null);
    try {
      await incidentsApi.addComment(id, commentText.trim());
      setCommentText("");
      comments.reload();
      timeline.reload();
    } catch (err) {
      setCommentError(errorMessage(err));
    }
  }

  async function removeComment(commentId: string) {
    try {
      await incidentsApi.deleteComment(id, commentId);
      comments.reload();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  function describe(ev: IncidentEvent): string {
    switch (ev.event_type) {
      case "CREATED":
        return ev.field_name === "source" && ev.new_value === "auto_alert"
          ? "Opened automatically from an alert"
          : "Incident created";
      case "STATUS_CHANGE":
        return `Status: ${titleCase(ev.old_value ?? "?")} → ${titleCase(ev.new_value ?? "?")}`;
      case "ASSIGNMENT_CHANGE":
        return ev.new_value ? `Assigned to ${userName(ev.new_value)}` : `Unassigned (was ${userName(ev.old_value)})`;
      case "SEVERITY_CHANGE":
        return `Severity: ${ev.old_value ?? "?"} → ${ev.new_value ?? "?"}`;
      case "PRIORITY_CHANGE":
        return `Priority: ${titleCase(ev.old_value ?? "?")} → ${titleCase(ev.new_value ?? "?")}`;
      case "COMMENT_ADDED":
        return "Comment added";
    }
  }

  const events = [...(timeline.data ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const assignable = users.filter((u) => u.role !== "VIEWER");
  const nextStatuses = NEXT_STATUSES[inc.status];

  return (
    <>
      <Link to="/incidents" className="text-sm text-muted hover:text-fg">← All incidents</Link>

      <div className="relative mb-6 mt-3 overflow-hidden rounded-lg border border-line bg-panel py-5 pl-7 pr-5">
        <span className={`absolute inset-y-0 left-0 w-1.5 ${SEVERITY_RAIL[inc.severity]}`} aria-hidden />
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={inc.severity} />
          <StatusBadge status={inc.status} />
          <PriorityBadge priority={inc.priority} />
          <span className="text-sm text-muted">{serviceName(inc.service_id)}</span>
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">{inc.title}</h1>
        <p className="mt-1 text-sm text-muted">
          Reported by {userName(inc.reporter_id)} · {timeAgo(inc.created_at)}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Panel title="Description">
            <p className="max-w-prose whitespace-pre-wrap text-sm leading-relaxed">{inc.description}</p>
          </Panel>

          {postmortemEligible && (
            postmortem.loading && !postmortem.data && !postmortem.error ? (
              <Spinner label="Loading postmortem…" />
            ) : postmortem.error ? (
              <ErrorNote message={postmortem.error} onRetry={postmortem.reload} />
            ) : (
              <PostmortemPanel
                incidentId={id}
                postmortem={postmortem.data}
                canEdit={canModify}
                onSaved={(p) => postmortem.setData(p)}
              />
            )
          )}

          <Panel title={`Discussion${comments.data ? ` (${comments.data.length})` : ""}`}>
            {comments.error && <ErrorNote message={comments.error} onRetry={comments.reload} />}
            {comments.data && comments.data.length === 0 && (
              <p className="text-sm text-muted">No comments yet.</p>
            )}
            <ul className="space-y-4">
              {comments.data?.map((c) => (
                <li key={c.id} className="border-l-2 border-line pl-4">
                  <div className="flex items-center justify-between gap-2 text-xs text-muted">
                    <span>
                      <span className="font-medium text-fg">{userName(c.author_id)}</span> · {timeAgo(c.created_at)}
                    </span>
                    {(user?.role === "ADMIN" || user?.id === c.author_id) && (
                      <button onClick={() => removeComment(c.id)} className="hover:text-sev1">Delete</button>
                    )}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
                </li>
              ))}
            </ul>
            {writer ? (
              <form onSubmit={submitComment} className="mt-5 space-y-2 border-t border-line pt-4">
                {commentError && <ErrorNote message={commentError} />}
                <textarea className={`${inputCls} min-h-20`} required aria-label="New comment" placeholder="Add an update for the team…" value={commentText} onChange={(e) => setCommentText(e.target.value)} />
                <div className="flex justify-end">
                  <button className={btnPrimary} disabled={!commentText.trim()}>Add comment</button>
                </div>
              </form>
            ) : (
              <p className="mt-4 border-t border-line pt-4 text-xs text-muted">Viewers can read but not comment.</p>
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Workflow">
            <ol className="mb-4 space-y-1.5">
              {STATUSES.map((s) => {
                const current = s === inc.status;
                return (
                  <li key={s} className={`flex items-center gap-2 text-sm ${current ? "font-medium text-fg" : "text-muted"}`}>
                    <span className={`h-2 w-2 rounded-full ${current ? "bg-pulse" : "bg-line"}`} aria-hidden />
                    {titleCase(s)}
                    {current && <span className="sr-only"> (current)</span>}
                  </li>
                );
              })}
            </ol>
            {writer ? (
              nextStatuses.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {nextStatuses.map((next: IncidentStatus, idx) => (
                    <button
                      key={next}
                      className={idx === 0 ? btnPrimary : btnGhost}
                      disabled={busy}
                      onClick={() => run(() => incidentsApi.changeStatus(id, next), `Status set to ${titleCase(next)}`)}
                    >
                      {ACTION_LABEL[`${inc.status}>${next}`] ?? `Move to ${titleCase(next)}`}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted">This incident is closed. No further transitions.</p>
              )
            ) : (
              <p className="text-xs text-muted">Only engineers and admins can change status.</p>
            )}
          </Panel>

          <Panel
            title="Details"
            action={canModify ? <button className="text-sm text-pulse underline underline-offset-2" onClick={() => setEditing(true)}>Edit</button> : undefined}
          >
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-muted">Assignee</dt>
                <dd className="mt-1">
                  {writer ? (
                    <div className="flex gap-2">
                      <select
                        className={selectCls}
                        aria-label="Assignee"
                        disabled={busy}
                        value={inc.assignee_id ?? ""}
                        onChange={(e) =>
                          run(() => incidentsApi.assign(id, e.target.value || null), e.target.value ? "Assignee updated" : "Incident unassigned")
                        }
                      >
                        <option value="">Unassigned</option>
                        {assignable.map((u) => (
                          <option key={u.id} value={u.id}>{u.id === user?.id ? `${u.full_name} (you)` : u.full_name}</option>
                        ))}
                        {inc.assignee_id && !assignable.some((u) => u.id === inc.assignee_id) && (
                          <option value={inc.assignee_id}>{userName(inc.assignee_id)}</option>
                        )}
                      </select>
                      {inc.assignee_id !== user?.id && (
                        <button className={btnGhost} disabled={busy} onClick={() => run(() => incidentsApi.assign(id, user!.id), "Assigned to you")}>
                          Take
                        </button>
                      )}
                    </div>
                  ) : (
                    userName(inc.assignee_id)
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Acknowledged</dt>
                <dd>{inc.acknowledged_at ? formatDateTime(inc.acknowledged_at) : "Not yet"}</dd>
              </div>
              <div>
                <dt className="text-muted">Resolved</dt>
                <dd>{inc.resolved_at ? formatDateTime(inc.resolved_at) : "Not yet"}</dd>
              </div>
              <div>
                <dt className="text-muted">Created</dt>
                <dd>{formatDateTime(inc.created_at)}</dd>
              </div>
            </dl>
          </Panel>

          <Panel title="Timeline">
            {timeline.error && <ErrorNote message={timeline.error} onRetry={timeline.reload} />}
            <ol className="space-y-4 border-l border-line pl-4">
              {events.map((ev) => (
                <li key={ev.id} className="relative">
                  <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-pulse" aria-hidden />
                  <p className="text-sm">{describe(ev)}</p>
                  <p className="text-xs text-muted">
                    {ev.actor_id ? userName(ev.actor_id) : "System"} · {formatDateTime(ev.created_at)}
                  </p>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </div>

      {editing && (
        <EditIncidentModal
          incident={inc}
          onClose={() => setEditing(false)}
          onSaved={(updated) => {
            applyUpdate(updated);
            setEditing(false);
            toast("Incident updated", "success");
          }}
        />
      )}
    </>
  );
}

function EditIncidentModal({
  incident,
  onClose,
  onSaved,
}: {
  incident: Incident;
  onClose: () => void;
  onSaved: (i: Incident) => void;
}) {
  const [title, setTitle] = useState(incident.title);
  const [description, setDescription] = useState(incident.description);
  const [severity, setSeverity] = useState<Severity>(incident.severity);
  const [priority, setPriority] = useState<Priority>(incident.priority);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSaved(await incidentsApi.update(incident.id, { title: title.trim(), description: description.trim(), severity, priority }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <Modal title="Edit incident" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <ErrorNote message={error} />}
        <Field label="Title">
          <input className={inputCls} required maxLength={255} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Description">
          <textarea className={`${inputCls} min-h-28`} required value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Severity">
            <select className={selectCls} value={severity} onChange={(e) => setSeverity(e.target.value as Severity)}>
              {SEVERITIES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Priority">
            <select className={selectCls} value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{titleCase(p)}</option>)}
            </select>
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className={btnGhost} onClick={onClose}>Cancel</button>
          <button className={btnPrimary} disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
        </div>
      </form>
    </Modal>
  );
}
