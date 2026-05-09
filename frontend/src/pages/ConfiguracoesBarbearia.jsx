import { useEffect, useState } from "react";
import Topbar from "../components/Topbar.jsx";
import { apiFetch } from "../api.js";
import { useBarbershop } from "../hooks/useBarbershop.js";

const emptyForm = {
  nome: "",
  slug: "",
  telefone: "",
  logoUrl: "",
  corPrimaria: "#D4A64A",
  timezone: "America/Sao_Paulo"
};

export default function ConfiguracoesBarbearia() {
  const { refreshBarbershopContext } = useBarbershop();
  const [form, setForm] = useState(emptyForm);
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    async function loadConfig() {
      setLoading(true);
      setError("");

      try {
        const response = await apiFetch("/configuracoes/barbearia");
        setForm({
          nome: response.barbearia?.nome || "",
          slug: response.barbearia?.slug || "",
          telefone: response.barbearia?.telefone || "",
          logoUrl: response.barbearia?.logo_url || "",
          corPrimaria: response.barbearia?.cor_primaria || "#D4A64A",
          timezone: response.barbearia?.timezone || "America/Sao_Paulo"
        });
        setSubscription(response.assinaturaSaas || null);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadConfig();
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await apiFetch("/configuracoes/barbearia", {
        method: "PUT",
        body: JSON.stringify(form)
      });
      await refreshBarbershopContext();
      setSuccess("Configuracoes salvas com sucesso.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex flex-col gap-8">
      <Topbar title="Configuracoes da barbearia" subtitle="Perfil e branding" />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-700">{success}</p> : null}

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="panel-card p-6">
          <h3 className="font-display text-2xl">Perfil publico</h3>
          {loading ? <p className="mt-4 text-sm muted-copy">Carregando configuracoes...</p> : null}
          {!loading ? (
            <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
              <input
                className="field-shell"
                onChange={(event) => setForm((current) => ({ ...current, nome: event.target.value }))}
                placeholder="Nome da barbearia"
                value={form.nome}
              />
              <input
                className="field-shell"
                onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))}
                placeholder="Slug"
                value={form.slug}
              />
              <input
                className="field-shell"
                onChange={(event) =>
                  setForm((current) => ({ ...current, telefone: event.target.value }))
                }
                placeholder="Telefone"
                value={form.telefone}
              />
              <input
                className="field-shell"
                onChange={(event) =>
                  setForm((current) => ({ ...current, logoUrl: event.target.value }))
                }
                placeholder="Logo URL"
                value={form.logoUrl}
              />
              <input
                className="field-shell"
                onChange={(event) =>
                  setForm((current) => ({ ...current, corPrimaria: event.target.value }))
                }
                placeholder="Cor primaria"
                value={form.corPrimaria}
              />
              <select
                className="field-shell"
                onChange={(event) =>
                  setForm((current) => ({ ...current, timezone: event.target.value }))
                }
                value={form.timezone}
              >
                <option value="America/Sao_Paulo">America/Sao_Paulo</option>
                <option value="America/Manaus">America/Manaus</option>
                <option value="America/Fortaleza">America/Fortaleza</option>
              </select>
              <button className="primary-button" disabled={saving} type="submit">
                {saving ? "Salvando..." : "Salvar configuracoes"}
              </button>
            </form>
          ) : null}
        </div>

        <div className="panel-card p-6">
          <h3 className="font-display text-2xl">Plano ativo</h3>
          <div className="mt-6 panel-card-soft p-5">
            <p className="text-xs uppercase tracking-[0.22em] muted-copy">Plano atual</p>
            <p className="mt-3 font-display text-4xl">
              {subscription?.plano_nome || "Plano"}
            </p>
            <p className="mt-3 text-sm muted-copy">
              Status: {subscription?.status || "active"} • Vencimento:{" "}
              {subscription?.vencimento
                ? String(subscription.vencimento).slice(0, 10)
                : "cobranca pendente"}
            </p>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="panel-card-soft p-4 text-sm">
              <p className="font-medium">Limite de agendamentos</p>
              <p className="mt-2 muted-copy">
                {subscription?.limite_agendamentos || "Ilimitado no plano atual"}
              </p>
            </div>
            <div className="panel-card-soft p-4 text-sm">
              <p className="font-medium">Limite de chatbots</p>
              <p className="mt-2 muted-copy">
                {subscription?.limite_chatbots || 1}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
