import { useEffect, useState } from "react";
import Topbar from "../components/Topbar.jsx";
import { apiFetch } from "../api.js";

const defaultSubscriberForm = {
  nome: "",
  telefone: "",
  planoId: "",
  statusPagamento: "pendente",
  observacoes: ""
};

function formatCurrency(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function formatDate(value) {
  const [year, month, day] = String(value || "").slice(0, 10).split("-");
  if (!year || !month || !day) return "";
  return `${day}/${month}/${year}`;
}

export default function Assinaturas() {
  const [summary, setSummary] = useState(null);
  const [plan, setPlan] = useState(null);
  const [clients, setClients] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [subscriberForm, setSubscriberForm] = useState(defaultSubscriberForm);
  const [loading, setLoading] = useState(true);
  const [savingSubscriber, setSavingSubscriber] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadData(currentStatus = statusFilter) {
    setLoading(true);
    setError("");

    try {
      const [summaryResponse, plansResponse, clientsResponse] = await Promise.all([
        apiFetch("/assinaturas/resumo"),
        apiFetch("/assinaturas/planos"),
        apiFetch(
          `/assinaturas/clientes${
            currentStatus ? `?status=${encodeURIComponent(currentStatus)}` : ""
          }`
        )
      ]);

      const activePlan = plansResponse[0] || null;
      setSummary(summaryResponse);
      setPlan(activePlan);
      setClients(clientsResponse);
      setSubscriberForm((current) => ({
        ...current,
        planoId: activePlan ? String(activePlan.id) : ""
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData(statusFilter);
  }, [statusFilter]);

  async function handleCreateSubscriber(event) {
    event.preventDefault();
    setSavingSubscriber(true);
    setError("");
    setSuccess("");

    try {
      await apiFetch("/assinaturas/clientes", {
        method: "POST",
        body: JSON.stringify({
          nome: subscriberForm.nome,
          telefone: subscriberForm.telefone,
          planoId: Number(subscriberForm.planoId),
          statusPagamento: subscriberForm.statusPagamento,
          observacoes: subscriberForm.observacoes || undefined
        })
      });
      setSubscriberForm((current) => ({
        ...defaultSubscriberForm,
        planoId: current.planoId
      }));
      setSuccess("Assinante cadastrado com sucesso.");
      await loadData(statusFilter);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingSubscriber(false);
    }
  }

  async function handleRegisterPayment(client) {
    const competencia = window.prompt("Competencia do pagamento (ex.: 2026-03):");
    if (!competencia) return;

    const valor = window.prompt("Valor pago:", String(client.plano_valor || ""));
    if (!valor) return;

    setError("");
    setSuccess("");

    try {
      await apiFetch(`/assinaturas/clientes/${client.id}/pagamentos`, {
        method: "POST",
        body: JSON.stringify({
          competencia,
          valor: Number(valor),
          status: "pago"
        })
      });
      setSuccess(`Pagamento registrado para ${client.nome}.`);
      await loadData(statusFilter);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRegisterCut(client) {
    setError("");
    setSuccess("");

    try {
      await apiFetch(`/assinaturas/clientes/${client.id}/consumos`, {
        method: "POST",
        body: JSON.stringify({
          descricao: "Corte",
          quantidade: 1
        })
      });
      setSuccess(`Consumo de corte registrado para ${client.nome}.`);
      await loadData(statusFilter);
    } catch (err) {
      setError(err.message);
    }
  }

  const cards = [
    { label: "Assinantes ativos", value: summary?.total_ativos || 0 },
    { label: "Pagamentos em dia", value: summary?.pagamentos_em_dia || 0 },
    { label: "Vencendo na semana", value: summary?.vencendo_semana || 0 },
    {
      label: "Receita mensal prevista",
      value: formatCurrency(summary?.receita_recorrente || 0)
    }
  ];

  return (
    <section className="flex flex-col gap-10">
      <Topbar title="Assinaturas e cortes mensais" subtitle="Assinaturas" />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-700">{success}</p> : null}
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
      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="glass rounded-3xl p-8 shadow-soft">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="font-display text-xl">Mensalistas</h3>
              <p className="text-sm text-ink/60 mt-2">
                Acompanhe nome do cliente, vencimento e status de pagamento.
              </p>
            </div>
            <select
              className="px-4 py-3 rounded-2xl bg-white/70 border border-ink/10"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="">Todos os status</option>
              <option value="pago">Pago</option>
              <option value="pendente">Pendente</option>
              <option value="atrasado">Atrasado</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </div>
          {loading ? <p className="text-sm text-ink/60 mt-6">Carregando assinaturas...</p> : null}
          {!loading && !clients.length ? (
            <p className="text-sm text-ink/60 mt-6">Nenhum assinante encontrado.</p>
          ) : null}
          {!loading && clients.length ? (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-ink/60">
                    <th className="py-3">Cliente</th>
                    <th className="py-3">Assinatura</th>
                    <th className="py-3">Vencimento</th>
                    <th className="py-3">Pagamento</th>
                    <th className="py-3">Cortes</th>
                    <th className="py-3">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((client) => (
                    <tr key={client.id} className="border-t border-ink/5 align-top">
                      <td className="py-4">
                        <p>{client.nome}</p>
                        <p className="text-xs text-ink/50">{client.telefone}</p>
                      </td>
                      <td className="py-4">
                        <p>{client.plano_nome}</p>
                        <p className="text-xs text-ink/50">
                          {formatCurrency(client.plano_valor)}
                        </p>
                      </td>
                      <td className="py-4">{formatDate(client.data_vencimento)}</td>
                      <td className="py-4">
                        <span className="px-3 py-1 rounded-full bg-mint/40 text-xs">
                          {client.status_pagamento}
                        </span>
                      </td>
                      <td className="py-4">
                        <p>Usados: {client.cortes_usados_mes}</p>
                        <p className="text-xs text-ink/50">
                          Restantes: {client.cortes_restantes}
                        </p>
                      </td>
                      <td className="py-4 flex flex-col gap-2">
                        <button
                          className="px-3 py-2 rounded-xl bg-ink text-cream"
                          type="button"
                          onClick={() => handleRegisterPayment(client)}
                        >
                          Registrar pagamento
                        </button>
                        <button
                          className="px-3 py-2 rounded-xl bg-white/70 border border-ink/10"
                          type="button"
                          onClick={() => handleRegisterCut(client)}
                        >
                          Registrar corte
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
        <div className="glass rounded-3xl p-8 shadow-soft">
          <h3 className="font-display text-xl">Novo assinante</h3>
          <div className="mt-4 rounded-2xl bg-white/60 border border-ink/5 px-5 py-4">
            <p className="text-sm text-ink/60">Plano unico da assinatura</p>
            <p className="font-display text-2xl mt-2">
              {plan ? `${plan.nome} - ${formatCurrency(plan.valor)}` : "R$ 159,99"}
            </p>
            <p className="text-sm text-ink/50 mt-2">
              {plan ? `${plan.cortes_inclusos} cortes inclusos a cada ${plan.validade_dias} dias.` : "Assinatura mensal fixa."}
            </p>
          </div>
          <form className="flex flex-col gap-4 mt-6" onSubmit={handleCreateSubscriber}>
            <input
              className="px-4 py-3 rounded-2xl bg-white/70 border border-ink/10"
              placeholder="Nome do cliente"
              value={subscriberForm.nome}
              onChange={(event) =>
                setSubscriberForm((current) => ({ ...current, nome: event.target.value }))
              }
            />
            <input
              className="px-4 py-3 rounded-2xl bg-white/70 border border-ink/10"
              placeholder="Telefone"
              value={subscriberForm.telefone}
              onChange={(event) =>
                setSubscriberForm((current) => ({
                  ...current,
                  telefone: event.target.value
                }))
              }
            />
            <select
              className="px-4 py-3 rounded-2xl bg-white/70 border border-ink/10"
              value={subscriberForm.statusPagamento}
              onChange={(event) =>
                setSubscriberForm((current) => ({
                  ...current,
                  statusPagamento: event.target.value
                }))
              }
            >
              <option value="pendente">Pendente</option>
              <option value="pago">Pago</option>
              <option value="atrasado">Atrasado</option>
              <option value="cancelado">Cancelado</option>
            </select>
            <textarea
              className="px-4 py-3 rounded-2xl bg-white/70 border border-ink/10 min-h-24"
              placeholder="Observacoes"
              value={subscriberForm.observacoes}
              onChange={(event) =>
                setSubscriberForm((current) => ({
                  ...current,
                  observacoes: event.target.value
                }))
              }
            />
            <button
              className="bg-ink text-cream rounded-2xl py-3 text-sm disabled:opacity-60"
              disabled={savingSubscriber || !subscriberForm.planoId}
            >
              {savingSubscriber ? "Salvando..." : "Cadastrar assinante"}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
