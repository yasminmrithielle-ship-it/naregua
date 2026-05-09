import { useBarbershop } from "../hooks/useBarbershop.js";
import { useTheme } from "../hooks/useTheme.js";

export default function Topbar({ title, subtitle, actions = null }) {
  const { barbershop, saasSubscription, whatsappConnection } = useBarbershop();
  const { theme, toggleTheme } = useTheme();

  const whatsappStatus =
    whatsappConnection?.runtimeStatus?.status ||
    whatsappConnection?.status ||
    "aguardando_qr";

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-[0.3em] muted-copy">{subtitle}</p>
        <h2 className="mt-2 font-display text-3xl sm:text-4xl">{title}</h2>
        <p className="mt-3 text-sm muted-copy">
          {barbershop?.name || "Barbearia"} • {saasSubscription?.plano_nome || "Plano"} •
          {" "}
          WhatsApp {whatsappStatus}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {actions}
        <button className="secondary-button" onClick={toggleTheme} type="button">
          {theme === "dark" ? "Modo claro" : "Modo escuro"}
        </button>
      </div>
    </div>
  );
}
