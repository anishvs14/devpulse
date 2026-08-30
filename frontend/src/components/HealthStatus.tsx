import { useEffect, useState } from "react";
import { getHealth, type HealthResponse } from "../services/api";

export function HealthStatus() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getHealth().then(setHealth).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-red-500">Backend unreachable: {error}</p>;
  if (!health) return <p className="text-gray-400">Checking backend…</p>;

  return (
    <p className="text-green-500">
      {health.service} v{health.version} — {health.status}
    </p>
  );
}