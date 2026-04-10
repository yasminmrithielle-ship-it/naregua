import { useEffect, useState } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import Sidebar from "./components/Sidebar.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Agenda from "./pages/Agenda.jsx";
import Horarios from "./pages/Horarios.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import Servicos from "./pages/Servicos.jsx";
import Assinaturas from "./pages/Assinaturas.jsx";
import { useAuth } from "./hooks/useAuth.js";
import { useBarbershop } from "./hooks/useBarbershop.js";

function LoadingScreen() {
  return (
    <div className="min-h-screen grid place-items-center px-6">
      <div className="glass rounded-3xl p-8 shadow-soft text-center">
        <p className="text-sm uppercase tracking-[0.24em] text-ink/50">
          Barber Go
        </p>
        <h1 className="font-display text-3xl mt-3">Carregando sua conta</h1>
      </div>
    </div>
  );
}

function ProtectedLayout({ children }) {
  const location = useLocation();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { barbershop, loading: barbershopLoading } = useBarbershop();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  if (authLoading || barbershopLoading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-10 grid gap-6 lg:gap-8 lg:grid-cols-[280px_1fr]">
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      <div className="lg:hidden">
        <div className="glass shadow-soft rounded-3xl px-4 py-3 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.24em] text-ink/60 truncate">
              {barbershop?.name || "Barbearia"}
            </p>
            <p className="font-display text-lg leading-tight">Painel Administrativo</p>
          </div>
          <button
            aria-label="Abrir menu"
            aria-expanded={sidebarOpen}
            className="shrink-0 rounded-2xl bg-ink px-3 py-3 text-cream"
            onClick={() => setSidebarOpen(true)}
            type="button"
          >
            <span className="flex w-5 flex-col gap-1">
              <span className="h-0.5 w-full rounded-full bg-current" />
              <span className="h-0.5 w-full rounded-full bg-current" />
              <span className="h-0.5 w-full rounded-full bg-current" />
            </span>
          </button>
        </div>
      </div>

      {sidebarOpen ? (
        <div className="lg:hidden fixed inset-0 z-40">
          <button
            aria-label="Fechar menu"
            className="absolute inset-0 bg-ink/45 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
            type="button"
          />
          <div className="absolute inset-y-0 left-0 w-[min(86vw,320px)] p-4">
            <Sidebar mobile onNavigate={() => setSidebarOpen(false)} />
          </div>
        </div>
      ) : null}

      <main className="flex flex-col gap-6 lg:gap-8 min-w-0">{children}</main>
    </div>
  );
}

export default function App() {
  const { loading: authLoading, isAuthenticated } = useAuth();

  if (authLoading && isAuthenticated) {
    return <LoadingScreen />;
  }

  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/cadastro" element={<Register />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedLayout>
            <Dashboard />
          </ProtectedLayout>
        }
      />
      <Route
        path="/agenda"
        element={
          <ProtectedLayout>
            <Agenda />
          </ProtectedLayout>
        }
      />
      <Route
        path="/horarios"
        element={
          <ProtectedLayout>
            <Horarios />
          </ProtectedLayout>
        }
      />
      <Route
        path="/servicos"
        element={
          <ProtectedLayout>
            <Servicos />
          </ProtectedLayout>
        }
      />
      <Route
        path="/assinaturas"
        element={
          <ProtectedLayout>
            <Assinaturas />
          </ProtectedLayout>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
