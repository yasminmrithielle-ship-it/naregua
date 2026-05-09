import { useEffect, useState } from "react";
import Topbar from "../components/Topbar.jsx";
import { apiFetch } from "../api.js";

const emptyForm = {
  nome: "",
  telefone: "",
  fotoUrl: "",
  especialidade: "",
  ativo: true
};

export default function Barbeiros() {
  const [barbeiros, setBarbeiros] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadBarbeiros() {
    setLoading(true);
    setError("");

    try {
      const response = await apiFetch("/barbeiros");
      setBarbeiros(response);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBarbeiros();
  }, []);

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const path = editingId ? `/barbeiros/${editingId}` : "/barbeiros";
      const method = editingId ? "PUT" : "POST";
      await apiFetch(path, {
        method,
        body: JSON.stringify(form)
      });
      setSuccess(editingId ? "Barbeiro atualizado." : "Barbeiro cadastrado.");
      resetForm();
      await loadBarbeiros();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex flex-col gap-8">
      <Topbar title="Equipe da barbearia" subtitle="Barbeiros" />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-700">{success}</p> : null}

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="panel-card p-6">
          <h3 className="font-display text-2xl">Profissionais ativos</h3>
          <p className="mt-2 text-sm muted-copy">
            Estruture a equipe para evoluir o SaaS com agenda por profissional nas proximas fases.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {loading ? <p className="text-sm muted-copy">Carregando equipe...</p> : null}
            {!loading && !barbeiros.length ? (
              <p className="text-sm muted-copy">Nenhum barbeiro cadastrado ainda.</p>
            ) : null}
            {!loading &&
              barbeiros.map((barbeiro) => (
                <div key={barbeiro.id} className="panel-card-soft p-5">
                  <div className="flex items-center gap-4">
                    {barbeiro.foto_url ? (
                      <img
                        alt={barbeiro.nome}
                        className="h-14 w-14 rounded-2xl object-cover"
                        src={barbeiro.foto_url}
                      />
                    ) : (
                      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[var(--accent)]/20 font-display text-lg text-[var(--accent-strong)]">
                        {barbeiro.nome.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <h4 className="truncate font-medium">{barbeiro.nome}</h4>
                      <p className="truncate text-sm muted-copy">
                        {barbeiro.especialidade || "Sem especialidade informada"}
                      </p>
                    </div>
                  </div>
                  <p className="mt-4 text-sm muted-copy">{barbeiro.telefone || "Sem telefone"}</p>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="tag-pill">{barbeiro.ativo ? "Ativo" : "Inativo"}</span>
                    <button
                      className="secondary-button"
                      onClick={() => {
                        setEditingId(barbeiro.id);
                        setForm({
                          nome: barbeiro.nome || "",
                          telefone: barbeiro.telefone || "",
                          fotoUrl: barbeiro.foto_url || "",
                          especialidade: barbeiro.especialidade || "",
                          ativo: Boolean(barbeiro.ativo)
                        });
                      }}
                      type="button"
                    >
                      Editar
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>

        <div className="panel-card p-6">
          <h3 className="font-display text-2xl">
            {editingId ? "Editar profissional" : "Novo profissional"}
          </h3>
          <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
            <input
              className="field-shell"
              onChange={(event) => setForm((current) => ({ ...current, nome: event.target.value }))}
              placeholder="Nome"
              value={form.nome}
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
                setForm((current) => ({ ...current, fotoUrl: event.target.value }))
              }
              placeholder="Foto URL"
              value={form.fotoUrl}
            />
            <input
              className="field-shell"
              onChange={(event) =>
                setForm((current) => ({ ...current, especialidade: event.target.value }))
              }
              placeholder="Especialidade"
              value={form.especialidade}
            />
            <label className="panel-card-soft flex items-center justify-between p-4 text-sm">
              <span>Profissional ativo</span>
              <input
                checked={form.ativo}
                onChange={(event) =>
                  setForm((current) => ({ ...current, ativo: event.target.checked }))
                }
                type="checkbox"
              />
            </label>
            <button className="primary-button" disabled={saving} type="submit">
              {saving ? "Salvando..." : editingId ? "Salvar alteracoes" : "Criar barbeiro"}
            </button>
            {editingId ? (
              <button className="secondary-button" onClick={resetForm} type="button">
                Cancelar edicao
              </button>
            ) : null}
          </form>
        </div>
      </div>
    </section>
  );
}
