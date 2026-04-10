import { useEffect, useState } from "react";
import Topbar from "../components/Topbar.jsx";
import { apiFetch } from "../api.js";
import { useBarbershop } from "../hooks/useBarbershop.js";

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function formatCurrency(value) {
  return `R$ ${Number(value || 0).toFixed(2)}`;
}

export default function Dashboard() {
  const { barbershop } = useBarbershop();
  const [summary, setSummary] = useState(null);
  const [subscriptionSummary, setSubscriptionSummary] = useState(null);
  const [freeSlots, setFreeSlots] = useState(0);
  const [totalClients, setTotalClients] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!barbershop?.id) {
      return;
    }

    async function loadDashboard() {
      const today = getToday();
      setError("");

      try {
        const [resumo, agendamentos, horariosDisponiveis, assinaturas] = await Promise.all([
          apiFetch(`/relatorios/resumo?data=${encodeURIComponent(today)}`),
          apiFetch(`/agendamentos?data=${encodeURIComponent(today)}`),
          apiFetch(
            `/horarios-disponiveis?data=${encodeURIComponent(today)}&barbeariaId=${encodeURIComponent(barbershop.id)}`
          ),
          apiFetch("/assinaturas/resumo")
        ]);

        setSummary(resumo);
        setSubscriptionSummary(assinaturas);
        setFreeSlots(horariosDisponiveis.length);
        setTotalClients(new Set(agendamentos.map((item) => item.telefone)).size);
      } catch (err) {
        setError(err.message);
      }
    }

    loadDashboard();
  }, [barbershop?.id]);

  const cards = [
    { label: "Agendamentos do dia", value: summary?.total || "0" },
    { label: "Total de clientes", value: totalClients },
    { label: "Horarios livres", value: freeSlots },
    {
      label: "Faturamento estimado",
      value: formatCurrency(summary?.faturamento_estimado || 0)
    }
  ];

  return (
    <section className="flex flex-col gap-10">
      <Topbar title="Resumo do dia" subtitle="Dashboard" />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="glass rounded-3xl p-6 shadow-soft">
            <p className="text-sm uppercase tracking-[0.2em] text-ink/60">
              {card.label}
            </p>
            <h3 className="font-display text-2xl mt-4">{card.value}</h3>
          </div>
        ))}
      </div>
      <div className="glass rounded-3xl p-8 shadow-soft">
        <h3 className="font-display text-xl">Highlights</h3>
        <div className="grid gap-6 md:grid-cols-3 mt-6">
          <div className="bg-white/60 rounded-2xl p-5 border border-ink/5">
            <p className="text-sm text-ink/60">Confirmados</p>
            <p className="font-medium mt-2">{summary?.confirmados || 0}</p>
          </div>
          <div className="bg-white/60 rounded-2xl p-5 border border-ink/5">
            <p className="text-sm text-ink/60">Cancelados</p>
            <p className="font-medium mt-2">{summary?.cancelados || 0}</p>
          </div>
          <div className="bg-white/60 rounded-2xl p-5 border border-ink/5">
            <p className="text-sm text-ink/60">Concluidos</p>
            <p className="font-medium mt-2">{summary?.concluidos || 0}</p>
          </div>
        </div>
      </div>
      <div className="glass rounded-3xl p-8 shadow-soft">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="font-display text-xl">Assinaturas ativas</h3>
            <p className="text-sm text-ink/60 mt-2">
              Resumo das mensalidades e recorrencia do caixa.
            </p>
          </div>
          <div className="rounded-2xl bg-white/70 border border-ink/10 px-4 py-3 text-right">
            <p className="text-xs uppercase tracking-[0.2em] text-ink/50">
              Receita recorrente
            </p>
            <p className="font-display text-xl">
              {formatCurrency(subscriptionSummary?.receita_recorrente || 0)}
            </p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-4 mt-6">
          <div className="bg-white/60 rounded-2xl p-5 border border-ink/5">
            <p className="text-sm text-ink/60">Assinantes ativos</p>
            <p className="font-medium mt-2">{subscriptionSummary?.total_ativos || 0}</p>
          </div>
          <div className="bg-white/60 rounded-2xl p-5 border border-ink/5">
            <p className="text-sm text-ink/60">Pagamentos em dia</p>
            <p className="font-medium mt-2">
              {subscriptionSummary?.pagamentos_em_dia || 0}
            </p>
          </div>
          <div className="bg-white/60 rounded-2xl p-5 border border-ink/5">
            <p className="text-sm text-ink/60">Pendentes</p>
            <p className="font-medium mt-2">
              {subscriptionSummary?.pagamentos_pendentes || 0}
            </p>
          </div>
          <div className="bg-white/60 rounded-2xl p-5 border border-ink/5">
            <p className="text-sm text-ink/60">Atrasados</p>
            <p className="font-medium mt-2">
              {subscriptionSummary?.pagamentos_atrasados || 0}
            </p>
          </div>
        </div>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink/60">
                <th className="py-3">Cliente</th>
                <th className="py-3">Plano</th>
                <th className="py-3">Vencimento</th>
                <th className="py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {(subscriptionSummary?.vencimentos_proximos || []).map((item) => (
                <tr key={item.id} className="border-t border-ink/5">
                  <td className="py-4">
                    <p>{item.nome}</p>
                    <p className="text-xs text-ink/50">{item.telefone}</p>
                  </td>
                  <td className="py-4">{item.plano_nome}</td>
                  <td className="py-4">{String(item.data_vencimento).slice(0, 10)}</td>
                  <td className="py-4">
                    <span className="px-3 py-1 rounded-full bg-mint/40 text-xs">
                      {item.status_pagamento}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!subscriptionSummary?.vencimentos_proximos?.length ? (
            <p className="text-sm text-ink/60 mt-4">
              Nenhum assinante cadastrado ainda.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
