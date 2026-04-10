import { useEffect, useState } from "react";
import Topbar from "../components/Topbar.jsx";
import { apiFetch } from "../api.js";

const emptyForm = {
  nome: "",
  duracao: "60",
  preco: ""
};

function toCurrency(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

export default function Servicos() {
  const [servicos, setServicos] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadServicos() {
    setLoading(true);
    setError("");

    try {
      const response = await apiFetch("/servicos");
      setServicos(response);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadServicos();
  }, []);

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
  }

  function startEdit(servico) {
    setEditingId(servico.id);
    setForm({
      nome: servico.nome,
      duracao: String(servico.duracao),
      preco: String(servico.preco)
    });
    setError("");
    setSuccess("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    const payload = {
      nome: form.nome.trim(),
      duracao: Number(form.duracao),
      preco: Number(form.preco)
    };

    try {
      if (editingId) {
        await apiFetch(`/servicos/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        });
        setSuccess("Servico atualizado com sucesso.");
      } else {
        await apiFetch("/servicos", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        setSuccess("Servico cadastrado com sucesso.");
      }

      resetForm();
      await loadServicos();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(servico) {
    const confirmed = window.confirm(`Deseja remover o servico ${servico.nome}?`);

    if (!confirmed) {
      return;
    }

    setError("");
    setSuccess("");

    try {
      await apiFetch(`/servicos/${servico.id}`, {
        method: "DELETE"
      });
      setSuccess("Servico removido com sucesso.");
      if (editingId === servico.id) {
        resetForm();
      }
      await loadServicos();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="flex flex-col gap-10">
      <Topbar title="Catalogo de servicos" subtitle="Servicos" />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-700">{success}</p> : null}
      <div className="grid gap-6 lg:grid-cols-[1.3fr_0.9fr]">
        <div className="glass rounded-3xl p-8 shadow-soft">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="font-display text-xl">Servicos cadastrados</h3>
              <p className="text-sm text-ink/60 mt-2">
                O faturamento estimado do dashboard usa os valores daqui.
              </p>
            </div>
          </div>
          {loading ? <p className="text-sm text-ink/60 mt-6">Carregando servicos...</p> : null}
          {!loading && !servicos.length ? (
            <p className="text-sm text-ink/60 mt-6">Nenhum servico cadastrado.</p>
          ) : null}
          {!loading && servicos.length ? (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-ink/60">
                    <th className="py-3">Servico</th>
                    <th className="py-3">Duracao</th>
                    <th className="py-3">Preco</th>
                    <th className="py-3">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {servicos.map((servico) => (
                    <tr key={servico.id} className="border-t border-ink/5">
                      <td className="py-4">{servico.nome}</td>
                      <td className="py-4">{servico.duracao} min</td>
                      <td className="py-4">{toCurrency(servico.preco)}</td>
                      <td className="py-4 flex gap-2">
                        <button
                          className="px-3 py-2 rounded-xl bg-white/70 border border-ink/10"
                          onClick={() => startEdit(servico)}
                          type="button"
                        >
                          Editar
                        </button>
                        <button
                          className="px-3 py-2 rounded-xl bg-ink text-cream"
                          onClick={() => handleDelete(servico)}
                          type="button"
                        >
                          Remover
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
          <h3 className="font-display text-xl">
            {editingId ? "Editar servico" : "Novo servico"}
          </h3>
          <form className="flex flex-col gap-4 mt-6" onSubmit={handleSubmit}>
            <label className="text-sm text-ink/70">
              Nome
              <input
                className="mt-2 w-full px-4 py-3 rounded-2xl bg-white/70 border border-ink/10"
                placeholder="Ex.: Corte degradê"
                value={form.nome}
                onChange={(event) =>
                  setForm((current) => ({ ...current, nome: event.target.value }))
                }
              />
            </label>
            <label className="text-sm text-ink/70">
              Duracao em minutos
              <input
                className="mt-2 w-full px-4 py-3 rounded-2xl bg-white/70 border border-ink/10"
                type="number"
                min="1"
                value={form.duracao}
                onChange={(event) =>
                  setForm((current) => ({ ...current, duracao: event.target.value }))
                }
              />
            </label>
            <label className="text-sm text-ink/70">
              Preco
              <input
                className="mt-2 w-full px-4 py-3 rounded-2xl bg-white/70 border border-ink/10"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                value={form.preco}
                onChange={(event) =>
                  setForm((current) => ({ ...current, preco: event.target.value }))
                }
              />
            </label>
            <button
              className="bg-ink text-cream rounded-2xl py-3 text-sm disabled:opacity-60"
              disabled={saving}
            >
              {saving ? "Salvando..." : editingId ? "Salvar alteracoes" : "Cadastrar servico"}
            </button>
            {editingId ? (
              <button
                className="bg-white/70 border border-ink/10 rounded-2xl py-3 text-sm"
                onClick={resetForm}
                type="button"
              >
                Cancelar edicao
              </button>
            ) : null}
          </form>
        </div>
      </div>
    </section>
  );
}
