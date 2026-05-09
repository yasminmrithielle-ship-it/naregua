import { useEffect, useState } from "react";
import { Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";
import Sidebar from "./components/Sidebar.jsx";
import BottomNav from "./components/BottomNav.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Agenda from "./pages/Agenda.jsx";
import Horarios from "./pages/Horarios.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import Servicos from "./pages/Servicos.jsx";
import Assinaturas from "./pages/Assinaturas.jsx";
import Onboarding from "./pages/Onboarding.jsx";
import Clientes from "./pages/Clientes.jsx";
import Barbeiros from "./pages/Barbeiros.jsx";
import ChatbotWhatsApp from "./pages/ChatbotWhatsApp.jsx";
import ConfiguracoesBarbearia from "./pages/ConfiguracoesBarbearia.jsx";
import PlanoSaas from "./pages/PlanoSaas.jsx";
import { useAuth } from "./hooks/useAuth.js";
import { useBarbershop } from "./hooks/useBarbershop.js";

function LoadingScreen() {
  return (
    <div className="app-shell grid place-items-center">
      <div className="panel-card p-8 text-center">
        <p className="text-xs uppercase tracking-[0.3em] muted-copy">Agenda Barber</p>
        <h1 className="mt-3 font-display text-3xl">Carregando sua barbearia</h1>
      </div>
    </div>
  );
}

function ProtectedAppShell() {
  const location = useLocation();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { loading: barbershopLoading } = useBarbershop();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  if (authLoading || barbershopLoading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return (
    <div className="app-shell">
      <div className="mx-auto grid max-w-[1600px] gap-6 lg:grid-cols-[300px_1fr]">
        <div className="hidden lg:block">
          <Sidebar />
        </div>

        <div className="lg:hidden">
          <button
            className="panel-card flex w-full items-center justify-between px-5 py-4"
            onClick={() => setSidebarOpen(true)}
            type="button"
          >
            <div className="text-left">
              <p className="text-[11px] uppercase tracking-[0.28em] muted-copy">Agenda Barber</p>
              <p className="mt-2 font-display text-2xl">Painel</p>
            </div>
            <span className="secondary-button">Menu</span>
          </button>
        </div>

        {sidebarOpen ? (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setSidebarOpen(false)}
              type="button"
            />
            <div className="absolute inset-y-0 left-0 w-[min(88vw,360px)] p-4">
              <Sidebar mobile onNavigate={() => setSidebarOpen(false)} />
            </div>
          </div>
        ) : null}

        <main className="flex min-w-0 flex-col gap-6">
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  );
}

function DefaultRedirect() {
  const { isAuthenticated } = useAuth();
  return <Navigate replace to={isAuthenticated ? "/app/dashboard" : "/login"} />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<DefaultRedirect />} />
      <Route path="/login" element={<Login />} />
      <Route path="/cadastro" element={<Register />} />

      <Route path="/app" element={<ProtectedAppShell />}>
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="onboarding" element={<Onboarding />} />
        <Route path="agenda" element={<Agenda />} />
        <Route path="clientes" element={<Clientes />} />
        <Route path="servicos" element={<Servicos />} />
        <Route path="barbeiros" element={<Barbeiros />} />
        <Route path="horarios" element={<Horarios />} />
        <Route path="chatbot" element={<ChatbotWhatsApp />} />
        <Route path="plano" element={<PlanoSaas />} />
        <Route path="assinaturas" element={<Assinaturas />} />
        <Route path="configuracoes" element={<ConfiguracoesBarbearia />} />
        <Route index element={<Navigate replace to="/app/dashboard" />} />
      </Route>

      <Route path="*" element={<Navigate replace to="/" />} />
    </Routes>
  );
}
