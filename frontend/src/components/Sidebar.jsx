import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.js";
import { useBarbershop } from "../hooks/useBarbershop.js";

const links = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/agenda", label: "Agenda" },
  { to: "/horarios", label: "Horarios" },
  { to: "/servicos", label: "Servicos" },
  { to: "/assinaturas", label: "Assinaturas" }
];

export default function Sidebar({ mobile = false, onNavigate }) {
  const navigate = useNavigate();
  const { user, membership, memberships, logout, switchBarbershop } = useAuth();
  const { barbershop } = useBarbershop();

  async function handleLogout() {
    await logout();
    navigate("/");
  }

  async function handleMembershipChange(event) {
    const nextBarbershopId = event.target.value;
    if (!nextBarbershopId || nextBarbershopId === membership?.barbershopId) {
      return;
    }

    await switchBarbershop(nextBarbershopId);
    onNavigate?.();
    navigate("/dashboard");
  }

  return (
    <aside
      className={`glass shadow-soft rounded-3xl p-6 flex flex-col gap-8 h-full ${
        mobile ? "min-h-full" : ""
      }`}
    >
      <div className="flex items-start gap-4">
        {barbershop?.logoUrl ? (
          <img
            alt={barbershop.name}
            className="h-14 w-14 rounded-2xl object-cover border border-ink/10 bg-white/70"
            src={barbershop.logoUrl}
          />
        ) : (
          <div className="h-14 w-14 rounded-2xl bg-ink text-cream grid place-items-center font-display text-xl">
            {(barbershop?.name || "BG").slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm uppercase tracking-[0.22em] text-ink/60 truncate">
            {barbershop?.name || "Barbearia"}
          </p>
          <h1 className="font-display text-2xl mt-2 leading-tight">
            Painel Administrativo
          </h1>
          <p className="text-xs text-ink/50 mt-2 truncate">
            {user?.email || "Conta"} | {membership?.role || "owner"}
          </p>
        </div>
      </div>

      {memberships.length > 1 ? (
        <label className="text-xs uppercase tracking-[0.18em] text-ink/55">
          Conta ativa
          <select
            className="mt-3 w-full rounded-2xl border border-ink/10 bg-white/70 px-4 py-3 text-sm text-ink"
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

      <nav className="flex flex-col gap-3">
        {links.map((link) => (
          <NavLink
            key={link.to}
            onClick={() => onNavigate?.()}
            to={link.to}
            className={({ isActive }) =>
              `px-4 py-3 rounded-2xl text-sm font-medium transition ${
                isActive ? "bg-ink text-cream" : "bg-white/50 hover:bg-white"
              }`
            }
          >
            {link.label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-4">
        <div className="rounded-2xl bg-white/60 border border-ink/5 px-4 py-4 text-xs text-ink/60">
          SaaS multiempresa ativo com tenant isolado por sessao e por conexao WhatsApp.
        </div>
        <button
          className="rounded-2xl border border-ink/10 bg-white/70 px-4 py-3 text-sm text-ink/75 transition hover:bg-ink hover:text-cream"
          onClick={handleLogout}
          type="button"
        >
          Sair
        </button>
      </div>
    </aside>
  );
}
