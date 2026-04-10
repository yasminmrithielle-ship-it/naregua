import { useBarbershop } from "../hooks/useBarbershop.js";

export default function Topbar({ title, subtitle }) {
  const { barbershop } = useBarbershop();

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="flex flex-col gap-2">
        <p className="text-sm uppercase tracking-[0.3em] text-ink/60">{subtitle}</p>
        <h2 className="font-display text-3xl">{title}</h2>
      </div>
      <div className="rounded-2xl border border-ink/10 bg-white/60 px-4 py-3 text-sm text-ink/65">
        <p className="font-medium text-ink">{barbershop?.name || "Barbearia"}</p>
        <p className="text-xs mt-1">
          {barbershop?.subscriptionPlan || "starter"} | {barbershop?.whatsappNumber || "WhatsApp pendente"}
        </p>
      </div>
    </div>
  );
}
