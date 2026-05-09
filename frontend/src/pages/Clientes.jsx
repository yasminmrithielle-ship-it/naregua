import { useEffect, useState } from "react";
import Topbar from "../components/Topbar.jsx";
import { apiFetch } from "../api.js";

const emptyForm = {
  nome: "",
  telefone: "",
  email: "",
  notas: ""
};

export default function Clientes() {
  const [clientes, setClientes] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadClientes(term = search) {
    setLoading(true);
    setError("");

    try {
      const query = term ? `?search=${encodeURIComponent(term)}` : "";
      const response = await apiFetch(`/clientes${query}`);
      setClientes(response);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadClientes();
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
      const method = editingId ? "PUT" : "POST";
      const path = editingId ? `/clientes/${editingId}` : "/clientes";
      await apiFetch(path, {
        method,
        body: JSON.stringify(form)
      });
      setSuccess(editingId ? "Cliente atualizado com sucesso." : "Cliente salvo com sucesso.");
      resetForm();
      await loadClientes();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex flex-col gap-8">
      <Topbar title="Clientes da barbearia" subtitle="Relacionamento" />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-700">{success}</p> : null}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="panel-card p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-display text-2xl">Base de clientes</h3>
              <p className="mt-2 text-sm muted-copy">
                Historico consolidado por tenant, com total de visitas e ultimo atendimento.
              </p>
            </div>
            <div className="flex gap-3">
              <input
                className="field-shell w-full sm:w-72"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por nome, email ou telefone"
                value={search}
              />
              <button className="secondary-button" onClick={() => loadClientes(search)} type="button">
                Buscar
              </button>
            </div>
          </div>

          <div className="mt-6 overflow-x-auto">
            {loading ? <p className="text-sm muted-copy">Carregando clientes...</p> : null}
            {!loading && !clientes.length ? (
              <p className="text-sm muted-copy">Nenhum cliente cadastrado para esta barbearia.</p>
            ) : null}
            {!loading && clientes.length ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left muted-copy">
                    <th className="py-3">Cliente</th>
                    <th className="py-3">Contato</th>
                    <th className="py-3">Agendamentos</th>
                    <th className="py-3">Ultimo atendimento</th>
                    <th className="py-3">Acao</th>
                  </tr>
                </thead>
                <tbody>
                  {clientes.map((cliente) => (
                    <tr key={cliente.id} className="border-t border-[var(--line)]">
                      <td className="py-4">
                        <p className="font-medium">{cliente.nome}</p>
                        <p className="text-xs muted-copy">{cliente.email || "Sem email"}</p>
                      </td>
                      <td className="py-4">{cliente.telefone}</td>
                      <td className="py-4">{cliente.total_agendamentos || 0}</td>
                      <td className="py-4">
                        {cliente.ultimo_agendamento
                          ? String(cliente.ultimo_agendamento).slice(0, 10)
                          : "Sem historico"}
                      </td>
                      <td className="py-4">
                        <button
                          className="secondary-button"
                          onClick={() => {
                            setEditingId(cliente.id);
                            setForm({
                              nome: cliente.nome || "",
                              telefone: cliente.telefone || "",
                              email: cliente.email || "",
                              notas: cliente.notas || ""
                            });
                          }}
                          type="button"
                        >
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
        </div>

        <div className="panel-card p-6">
          <h3 className="font-display text-2xl">
            {editingId ? "Editar cliente" : "Novo cliente"}
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
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              placeholder="Email"
              value={form.email}
            />
            <textarea
              className="field-shell min-h-28"
              onChange={(event) => setForm((current) => ({ ...current, notas: event.target.value }))}
              placeholder="Observacoes"
              value={form.notas}
            />
            <button className="primary-button" disabled={saving} type="submit">
              {saving ? "Salvando..." : editingId ? "Salvar alteracoes" : "Criar cliente"}
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
