import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Topbar from "../components/Topbar.jsx";
import { apiFetch } from "../api.js";

function formatCurrency(value) {
  return `R$ ${Number(value || 0).toFixed(2)}`;
}

export default function Dashboard() {
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadDashboard() {
      setError("");

      try {
        const response = await apiFetch("/dashboard");
        setPayload(response);
      } catch (err) {
        setError(err.message);
      }
    }

    loadDashboard();
  }, []);

  const resumo = payload?.resumo || {};
  const whatsappStatus = payload?.whatsapp_status?.status || "aguardando_qr";

  const cards = [
    { label: "Agendamentos hoje", value: resumo.agendamentos_hoje || 0 },
    { label: "Confirmados hoje", value: resumo.confirmados_hoje || 0 },
    { label: "Clientes novos no mes", value: payload?.clientes_novos_mes || 0 },
    { label: "Faturamento estimado", value: formatCurrency(resumo.faturamento_estimado) }
  ];

  return (
    <section className="flex flex-col gap-8">
      <Topbar title="Resumo operacional" subtitle="Dashboard" />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="panel-card p-6">
            <p className="text-xs uppercase tracking-[0.24em] muted-copy">{card.label}</p>
            <h3 className="mt-4 font-display text-4xl">{card.value}</h3>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="panel-card p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="font-display text-2xl">Proximos horarios</h3>
              <p className="mt-2 text-sm muted-copy">
                Visao rapida para quem esta operando no celular ou no desktop.
              </p>
            </div>
            <Link className="secondary-button" to="/app/agenda">
              Abrir agenda
            </Link>
          </div>

          <div className="mt-6 grid gap-4">
            {(payload?.proximos_horarios || []).map((item) => (
              <div key={item.id} className="panel-card-soft p-4">
                <p className="font-medium">
                  {String(item.data).slice(0, 10)} as {item.hora}
                </p>
                <p className="mt-2 text-sm muted-copy">
                  {item.cliente_nome || "Cliente"} • {item.servico_nome || item.servico}
                </p>
              </div>
            ))}
            {!payload?.proximos_horarios?.length ? (
              <p className="text-sm muted-copy">Nenhum horario futuro encontrado.</p>
            ) : null}
          </div>
        </div>

        <div className="panel-card p-6">
          <h3 className="font-display text-2xl">Atalhos rapidos</h3>
          <div className="mt-6 grid gap-4">
            <div className="panel-card-soft p-5">
              <p className="text-xs uppercase tracking-[0.22em] muted-copy">WhatsApp</p>
              <p className="mt-3 font-display text-3xl">{whatsappStatus}</p>
              <Link className="secondary-button mt-4 inline-flex" to="/app/chatbot">
                Gerenciar chatbot
              </Link>
            </div>
            <div className="panel-card-soft p-5">
              <p className="text-xs uppercase tracking-[0.22em] muted-copy">Onboarding</p>
              <p className="mt-3 text-sm leading-7 muted-copy">
                Complete servicos, horarios, WhatsApp e branding para deixar o Android pronto.
              </p>
              <Link className="secondary-button mt-4 inline-flex" to="/app/onboarding">
                Continuar setup
              </Link>
            </div>
            <div className="panel-card-soft p-5">
              <p className="text-xs uppercase tracking-[0.22em] muted-copy">Mensalistas</p>
              <p className="mt-3 text-sm leading-7 muted-copy">
                O modulo de mensalistas da propria barbearia segue ativo dentro do painel.
              </p>
              <Link className="secondary-button mt-4 inline-flex" to="/app/assinaturas">
                Abrir assinaturas
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
