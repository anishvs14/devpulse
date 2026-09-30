import { titleCase } from "../lib/format";
import type { IncidentStatus, Priority, ServiceStatus, Severity } from "../types/api";

const chip = "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium whitespace-nowrap";

export const SEVERITY_TEXT: Record<Severity, string> = {
  SEV1: "text-sev1",
  SEV2: "text-sev2",
  SEV3: "text-sev3",
  SEV4: "text-sev4",
};
/** Left-rail colour on incident/alert rows — severity is the first thing an on-call eye should catch. */
export const SEVERITY_RAIL: Record<Severity, string> = {
  SEV1: "bg-sev1",
  SEV2: "bg-sev2",
  SEV3: "bg-sev3",
  SEV4: "bg-sev4",
};
export const SEVERITY_HEX: Record<Severity, string> = {
  SEV1: "#ff6161",
  SEV2: "#ff9f43",
  SEV3: "#f2d14b",
  SEV4: "#6ea8fe",
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  const bg: Record<Severity, string> = {
    SEV1: "bg-sev1/15 text-sev1",
    SEV2: "bg-sev2/15 text-sev2",
    SEV3: "bg-sev3/15 text-sev3",
    SEV4: "bg-sev4/15 text-sev4",
  };
  return <span className={`${chip} font-mono ${bg[severity]}`}>{severity}</span>;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const tone: Record<Priority, string> = {
    URGENT: "border-sev1/60 text-sev1",
    HIGH: "border-sev2/60 text-sev2",
    MEDIUM: "border-line text-fg",
    LOW: "border-line text-muted",
  };
  return <span className={`${chip} border ${tone[priority]}`}>{titleCase(priority)}</span>;
}

export function StatusBadge({ status }: { status: IncidentStatus }) {
  const tone: Record<IncidentStatus, string> = {
    OPEN: "bg-sev1/15 text-sev1",
    INVESTIGATING: "bg-sev2/15 text-sev2",
    IDENTIFIED: "bg-sev3/15 text-sev3",
    MITIGATING: "bg-sev4/15 text-sev4",
    RESOLVED: "bg-ok/15 text-ok",
    CLOSED: "bg-raised text-muted",
  };
  return <span className={`${chip} ${tone[status]}`}>{titleCase(status)}</span>;
}

export function ServiceStatusDot({ status }: { status: ServiceStatus }) {
  const tone: Record<ServiceStatus, string> = {
    HEALTHY: "bg-ok",
    DEGRADED: "bg-sev3",
    DOWN: "bg-sev1",
    UNKNOWN: "bg-muted",
  };
  return (
    <span className="inline-flex items-center gap-2 text-sm">
      <span className={`h-2 w-2 rounded-full ${tone[status]}`} aria-hidden />
      {titleCase(status)}
    </span>
  );
}
