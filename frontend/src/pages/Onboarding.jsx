import { Link } from "react-router-dom";
import Topbar from "../components/Topbar.jsx";
import { useBarbershop } from "../hooks/useBarbershop.js";

const steps = [
  {
    title: "1. Cadastre seus servicos",
    description: "Monte o catalogo com duracao e preco para o dashboard calcular faturamento.",
    to: "/app/servicos",
    cta: "Abrir servicos"
  },
  {
    title: "2. Estruture horarios",
    description: "Crie a grade da semana para liberar os primeiros encaixes no painel e no bot.",
    to: "/app/horarios",
    cta: "Abrir horarios"
  },
  {
    title: "3. Conecte o WhatsApp",
    description: "Cada barbearia usa sua propria sessao, QR e status separados.",
    to: "/app/chatbot",
    cta: "Abrir WhatsApp"
  },
  {
    title: "4. Ajuste o perfil da barbearia",
    description: "Logo, telefone, slug e cor deixam o app pronto para cliente e Android.",
    to: "/app/configuracoes",
    cta: "Abrir configuracoes"
  }
];

export default function Onboarding() {
  const { barbershop, saasSubscription } = useBarbershop();

  return (
    <section className="flex flex-col gap-8">
      <Topbar title="Onboarding inicial" subtitle="Primeiros passos" />

      <div className="panel-card p-6 sm:p-8">
        <p className="text-xs uppercase tracking-[0.28em] muted-copy">Conta criada</p>
        <h3 className="mt-3 font-display text-3xl">
          {barbershop?.name || "Sua barbearia"} ja nasceu como tenant proprio
        </h3>
        <p className="mt-4 max-w-3xl text-sm leading-7 muted-copy">
          A conta proprietaria, o painel admin, o plano ativo e a sessao individual do
          WhatsApp ja estao preparados. Agora e so completar o setup operacional.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <span className="tag-pill">{saasSubscription?.status || "active"}</span>
          <span className="tag-pill">{saasSubscription?.plano_nome || "Plano"}</span>
          <span className="tag-pill">{barbershop?.slug || "slug pendente"}</span>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {steps.map((step) => (
          <div key={step.title} className="panel-card p-6">
            <h4 className="font-display text-2xl">{step.title}</h4>
            <p className="mt-3 text-sm leading-7 muted-copy">{step.description}</p>
            <Link className="primary-button mt-6 inline-flex" to={step.to}>
              {step.cta}
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
