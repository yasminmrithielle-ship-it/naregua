import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.js";
import { useBarbershop } from "../hooks/useBarbershop.js";

const links = [
  { to: "/app/dashboard", label: "Dashboard", shortLabel: "Dash" },
  { to: "/app/onboarding", label: "Onboarding", shortLabel: "Start" },
  { to: "/app/agenda", label: "Agenda", shortLabel: "Agenda" },
  { to: "/app/clientes", label: "Clientes", shortLabel: "Clientes" },
  { to: "/app/servicos", label: "Servicos", shortLabel: "Servicos" },
  { to: "/app/barbeiros", label: "Barbeiros", shortLabel: "Barbeiros" },
  { to: "/app/horarios", label: "Horarios", shortLabel: "Horarios" },
  { to: "/app/chatbot", label: "WhatsApp", shortLabel: "WhatsApp" },
  { to: "/app/plano", label: "Plano", shortLabel: "Plano" },
  { to: "/app/assinaturas", label: "Mensalistas", shortLabel: "Clube" },
  { to: "/app/configuracoes", label: "Configuracoes", shortLabel: "Config" }
];

function activeClass(isActive) {
  return isActive
    ? "bg-[rgba(212,166,74,0.16)] text-[var(--accent-strong)] border-[rgba(212,166,74,0.24)]"
    : "text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-soft)]";
}

export function navigationLinks() {
  return links;
}

export default function Sidebar({ mobile = false, onNavigate }) {
  const navigate = useNavigate();
  const { user, membership, memberships, logout, switchBarbershop } = useAuth();
  const { barbershop, saasSubscription } = useBarbershop();

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  async function handleMembershipChange(event) {
    const nextBarbershopId = event.target.value;
    if (!nextBarbershopId || nextBarbershopId === membership?.barbershopId) {
      return;
    }

    await switchBarbershop(nextBarbershopId);
    onNavigate?.();
    navigate("/app/dashboard");
  }

  return (
    <aside
      className={`panel-card h-full p-5 sm:p-6 ${mobile ? "min-h-full" : ""}`}
    >
      <div className="flex h-full flex-col gap-6">
        <div className="panel-card-soft p-4">
          <div className="flex items-center gap-3">
            {barbershop?.logoUrl ? (
              <img
                alt={barbershop.name}
                className="h-14 w-14 rounded-2xl object-cover"
                src={barbershop.logoUrl}
              />
            ) : (
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[var(--text)] font-display text-lg text-white">
                {(barbershop?.name || "AG").slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-[11px] uppercase tracking-[0.28em] muted-copy">
                Agenda Barber
              </p>
              <h1 className="truncate font-display text-2xl">{barbershop?.name || "Barbearia"}</h1>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="tag-pill">
              {saasSubscription?.plano_nome || barbershop?.subscriptionPlan || "Plano"}
            </span>
            <span className="tag-pill">
              {membership?.role || "owner"}
            </span>
          </div>

          <p className="mt-4 text-sm muted-copy">{user?.email || "Conta da barbearia"}</p>
        </div>

        {memberships.length > 1 ? (
          <label className="text-xs uppercase tracking-[0.22em] muted-copy">
            Conta ativa
            <select
              className="field-shell mt-3 w-full"
              onChange={handleMembershipChange}
              value={membership?.barbershopId || ""}
            >
              {memberships.map((item) => (
                <option key={item.barbershop.id} value={item.barbershop.id}>
                  {item.barbershop.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <nav className="grid gap-2">
          {links.map((link) => (
            <NavLink
              key={link.to}
              className={({ isActive }) =>
                `rounded-2xl border px-4 py-3 text-sm font-medium transition ${activeClass(
                  isActive
                )}`
              }
              onClick={() => onNavigate?.()}
              to={link.to}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto grid gap-3">
          <div className="panel-card-soft p-4 text-sm muted-copy">
            Tenant isolado por token, dados por barbearia e WhatsApp individual por sessao.
          </div>
          <button className="secondary-button" onClick={handleLogout} type="button">
            Sair
          </button>
        </div>
      </div>
    </aside>
  );
}
