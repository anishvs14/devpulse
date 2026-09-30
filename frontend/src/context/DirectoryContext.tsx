import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { servicesApi, usersApi } from "../services/api";
import { shortId } from "../lib/format";
import { useAuth } from "./AuthContext";
import { useRealtimeEvent } from "./RealtimeContext";
import type { Service, UserBrief } from "../types/api";

interface DirectoryState {
  services: Service[];
  users: UserBrief[];
  serviceName: (id: string) => string;
  userName: (id: string | null) => string;
  refreshServices: () => Promise<void>;
}

const DirectoryContext = createContext<DirectoryState | null>(null);

/**
 * id → name lookups shared by every page. Incidents, comments, alerts and the
 * audit timeline only carry UUIDs, so without this every row would show a hash.
 */
export function DirectoryProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [services, setServices] = useState<Service[]>([]);
  const [users, setUsers] = useState<UserBrief[]>([]);

  const refreshServices = useCallback(async () => {
    try {
      // 100 is the API's max page size — plenty for a portfolio-scale catalogue.
      const page = await servicesApi.list({ size: 100 });
      setServices(page.items);
    } catch {
      /* pages surface their own errors; the directory just stays as-is */
    }
  }, []);

  useEffect(() => {
    void refreshServices();
    usersApi
      .directory()
      .then(setUsers)
      .catch(() => {
        // Backend without /users/directory: degrade to "just me" instead of breaking.
        if (user) setUsers([{ id: user.id, full_name: user.full_name, role: user.role }]);
      });
  }, [refreshServices, user]);

  // The worker flips service health automatically — keep names/status fresh.
  useRealtimeEvent((e) => {
    if (e.type === "service_status_changed") {
      setServices((prev) =>
        prev.map((s) => (s.id === e.data.service_id ? { ...s, status: e.data.status } : s)),
      );
    }
  });

  const value = useMemo<DirectoryState>(() => {
    const serviceMap = new Map(services.map((s) => [s.id, s.name]));
    const userMap = new Map(users.map((u) => [u.id, u.full_name]));
    return {
      services,
      users,
      refreshServices,
      serviceName: (id) => serviceMap.get(id) ?? `service ${shortId(id)}`,
      userName: (id) => {
        if (!id) return "Unassigned";
        if (id === user?.id) return "You";
        return userMap.get(id) ?? `user ${shortId(id)}`;
      },
    };
  }, [services, users, user, refreshServices]);

  return <DirectoryContext.Provider value={value}>{children}</DirectoryContext.Provider>;
}

export function useDirectory(): DirectoryState {
  const ctx = useContext(DirectoryContext);
  if (!ctx) throw new Error("useDirectory must be used inside <DirectoryProvider>");
  return ctx;
}
