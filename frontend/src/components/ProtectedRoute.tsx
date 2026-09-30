import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { DirectoryProvider } from "../context/DirectoryContext";
import { RealtimeProvider } from "../context/RealtimeContext";
import { Spinner } from "./ui";

/** Gate for everything behind login. Live-data providers only mount for signed-in users. */
export function ProtectedRoute() {
  const { user, token, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Spinner label="Checking your session…" />;
  if (!token || !user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  return (
    <RealtimeProvider>
      <DirectoryProvider>
        <Outlet />
      </DirectoryProvider>
    </RealtimeProvider>
  );
}
