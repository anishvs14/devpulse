import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import { AlertsPage } from "./pages/AlertsPage";
import { LoginPage, RegisterPage } from "./pages/AuthPages";
import { DashboardPage } from "./pages/DashboardPage";
import { IncidentDetailPage } from "./pages/IncidentDetailPage";
import { IncidentsPage } from "./pages/IncidentsPage";
import { ServicesPage } from "./pages/ServicesPage";

function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>
                <Route index element={<DashboardPage />} />
                <Route path="incidents" element={<IncidentsPage />} />
                <Route path="incidents/:id" element={<IncidentDetailPage />} />
                <Route path="services" element={<ServicesPage />} />
                <Route path="alerts" element={<AlertsPage />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;
