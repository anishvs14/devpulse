import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useDirectory } from "../context/DirectoryContext";
import { useConnectionState, useRealtimeEvent } from "../context/RealtimeContext";
import { useToast } from "../context/ToastContext";

const NAV = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/incidents", label: "Incidents", end: false },
  { to: "/services", label: "Services", end: false },
  { to: "/alerts", label: "Alerts", end: false },
];

function LiveIndicator() {
  const connection = useConnectionState();
  const label = { open: "Live", connecting: "Connecting…", closed: "Offline — retrying" }[connection];
  const dot = { open: "bg-ok heartbeat", connecting: "bg-sev3", closed: "bg-sev1" }[connection];
  return (
    <span className="flex items-center gap-2 text-xs text-muted" title="Real-time WebSocket connection">
      <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
      {label}
    </span>
  );
}

/** Turns backend real-time events into toasts, wherever the user is in the app. */
function LiveToasts() {
  const toast = useToast();
  const { serviceName } = useDirectory();
  useRealtimeEvent((e) => {
    if (e.type === "incident_created") {
      toast(`New ${e.data.severity} incident on ${serviceName(e.data.service_id)}: ${e.data.title}`, "alert");
    } else if (e.type === "alert_ingested") {
      toast(`${e.data.severity} alert "${e.data.alert_type}" on ${serviceName(e.data.service_id)}`, "info");
    }
  });
  return null;
}

export function Layout() {
  const { user, logout } = useAuth();
  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `rounded-md px-3 py-2 text-sm font-medium transition-colors ${
      isActive ? "bg-raised text-fg" : "text-muted hover:text-fg"
    }`;

  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col gap-4 border-b border-line bg-panel p-4 md:h-screen md:w-56 md:sticky md:top-0 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between md:block">
          <div className="text-lg font-semibold tracking-tight">
            Dev<span className="text-pulse">Pulse</span>
          </div>
          <div className="md:mt-2">
            <LiveIndicator />
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto md:flex-col" aria-label="Main">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={linkCls}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto hidden border-t border-line pt-4 text-sm md:block">
          <p className="truncate font-medium">{user?.full_name}</p>
          <p className="text-xs text-muted">{user?.role.toLowerCase()}</p>
          <button onClick={logout} className="mt-3 text-muted underline underline-offset-2 hover:text-fg">
            Sign out
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-4 md:p-8">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
        <button
          onClick={logout}
          className="mt-8 text-sm text-muted underline underline-offset-2 md:hidden"
        >
          Sign out ({user?.full_name})
        </button>
      </main>
      <LiveToasts />
    </div>
  );
}
