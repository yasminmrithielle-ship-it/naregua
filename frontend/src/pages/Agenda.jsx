import { useEffect, useMemo, useState } from "react";
import Topbar from "../components/Topbar.jsx";
import { apiFetch, buildChatbotUrl } from "../api.js";
import { useBarbershop } from "../hooks/useBarbershop.js";

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function formatDateLabel(date) {
  const [year, month, day] = String(date).slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function getInitialForm(date, serviceName = "Corte") {
  return {
    nome: "",
    telefone: "",
    data: date,
    hora: "07:00",
    servico: serviceName
  };
}

function statusBadgeClass(status) {
  if (status === "cancelado") return "bg-rose-100 text-rose-700";
  if (status === "concluido") return "bg-emerald-100 text-emerald-700";
  return "bg-mint/40 text-ink";
}

function appendCacheBuster(url, token) {
  if (!url) {
    return "";
  }

  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}t=${token}`;
}

function WhatsAppQrModal({ isOpen, onClose, qrPageUrl, sessionName }) {
  const [refreshToken, setRefreshToken] = useState(() => Date.now());

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setRefreshToken(Date.now());
    const timer = window.setInterval(() => {
      setRefreshToken(Date.now());
    }, 15000);

    return () => window.clearInterval(timer);
  }, [isOpen]);

  if (!isOpen) return null;

  const iframeSrc = appendCacheBuster(qrPageUrl, refreshToken);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4 backdrop-blur-sm">
      <div className="w-full max-w-5xl rounded-[28px] border border-white/40 bg-[#fffdf8] p-6 shadow-[0_24px_80px_rgba(17,24,39,0.18)] md:p-8">
        <div className="flex flex-col gap-4 border-b border-ink/5 pb-5 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-ink/45">WhatsApp</p>
            <h2 className="mt-2 text-3xl font-semibold text-ink">QR Code da conexao</h2>
            <p className="mt-2 text-sm text-ink/60">
              Escaneie este QR no WhatsApp para conectar a sessao da barbearia sem sair do painel.
            </p>
            {sessionName ? (
              <p className="mt-3 text-xs uppercase tracking-[0.25em] text-ink/45">
                Sessao: {sessionName}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-3">
            <a
              className="rounded-full border border-ink/10 px-4 py-2 text-sm text-ink/70 transition hover:bg-ink hover:text-cream"
              href={qrPageUrl}
              rel="noreferrer"
              target="_blank"
            >
              Abrir em nova aba
            </a>
            <button
              className="rounded-full border border-ink/10 px-4 py-2 text-sm text-ink/70 transition hover:bg-ink hover:text-cream"
              onClick={onClose}
              type="button"
            >
              Fechar
            </button>
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-[28px] border border-ink/8 bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
          <iframe
            className="h-[540px] w-full bg-[#f6f3ee]"
            src={iframeSrc}
            title="QR Code do WhatsApp"
          />
        </div>
      </div>
    </div>
  );
}

function AppointmentModal({
  type,
  form,
  onChange,
  onClose,
  onSubmit,
  agendamento,
  servicos,
  saving
}) {
  if (!type) return null;

  const isView = type === "view";
  const isEdit = type === "edit";
  const title = isView
    ? "Cliente agendado"
    : isEdit
      ? "Editar agendamento"
      : "Novo agendamento";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-[28px] border border-white/40 bg-[#fffdf8] p-6 shadow-[0_24px_80px_rgba(17,24,39,0.18)] md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-ink/45">Agenda</p>
            <h2 className="mt-2 text-3xl font-semibold text-ink">{title}</h2>
            <p className="mt-2 text-sm text-ink/60">
              {isView
                ? "Consulte os dados do cliente sem sair da agenda."
                : "Preencha os dados abaixo para salvar o agendamento."}
            </p>
          </div>
          <button
            className="rounded-full border border-ink/10 px-4 py-2 text-sm text-ink/70 transition hover:bg-ink hover:text-cream"
            onClick={onClose}
            type="button"
          >
            Fechar
          </button>
        </div>

        {isView ? (
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-ink/5 bg-white/75 p-5">
              <p className="text-xs uppercase tracking-[0.3em] text-ink/45">Cliente</p>
              <h3 className="mt-3 text-2xl font-semibold text-ink">{agendamento.nome}</h3>
              <p className="mt-2 text-sm text-ink/60">{agendamento.telefone}</p>
            </div>
            <div className="rounded-3xl border border-ink/5 bg-white/75 p-5">
              <p className="text-xs uppercase tracking-[0.3em] text-ink/45">Servico</p>
              <h3 className="mt-3 text-2xl font-semibold text-ink">{agendamento.servico}</h3>
              <p className="mt-2 text-sm text-ink/60">
                {formatDateLabel(agendamento.data)} as {agendamento.hora}
              </p>
            </div>
            <div className="rounded-3xl border border-ink/5 bg-white/75 p-5">
              <p className="text-xs uppercase tracking-[0.3em] text-ink/45">Status</p>
              <span
                className={`mt-3 inline-flex rounded-full px-4 py-2 text-sm font-medium ${statusBadgeClass(
                  agendamento.status
                )}`}
              >
                {agendamento.status}
              </span>
            </div>
            <div className="rounded-3xl border border-ink/5 bg-white/75 p-5">
              <p className="text-xs uppercase tracking-[0.3em] text-ink/45">Resumo</p>
              <p className="mt-3 text-sm leading-7 text-ink/70">
                Cliente agendado para {formatDateLabel(agendamento.data)} as {agendamento.hora},
                com servico de {agendamento.servico}.
              </p>
            </div>
          </div>
        ) : (
          <form className="mt-8 grid gap-4 md:grid-cols-2" onSubmit={onSubmit}>
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-ink/70">Nome do cliente</span>
              <input
                className="rounded-2xl border border-ink/10 bg-white px-4 py-3 outline-none transition focus:border-ink/30"
                name="nome"
                onChange={onChange}
                required
                type="text"
                value={form.nome}
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-ink/70">Telefone com DDD</span>
              <input
                className="rounded-2xl border border-ink/10 bg-white px-4 py-3 outline-none transition focus:border-ink/30"
                name="telefone"
                onChange={onChange}
                required
                type="text"
                value={form.telefone}
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-ink/70">Data</span>
              <input
                className="rounded-2xl border border-ink/10 bg-white px-4 py-3 outline-none transition focus:border-ink/30"
                name="data"
                onChange={onChange}
                required
                type="date"
                value={form.data}
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-ink/70">Hora</span>
              <input
                className="rounded-2xl border border-ink/10 bg-white px-4 py-3 outline-none transition focus:border-ink/30"
                name="hora"
                onChange={onChange}
                required
                type="time"
                value={form.hora}
              />
            </label>
            <label className="flex flex-col gap-2 md:col-span-2">
              <span className="text-sm font-medium text-ink/70">Servico</span>
              <select
                className="rounded-2xl border border-ink/10 bg-white px-4 py-3 outline-none transition focus:border-ink/30"
                name="servico"
                onChange={onChange}
                value={form.servico}
              >
                {servicos.map((item) => (
                  <option key={item.id ?? item.nome} value={item.nome}>
                    {item.nome}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-2 flex flex-wrap gap-3 md:col-span-2">
              <button
                className="rounded-2xl bg-ink px-5 py-3 text-sm font-medium text-cream transition hover:opacity-90"
                disabled={saving}
                type="submit"
              >
                {saving ? "Salvando..." : isEdit ? "Salvar alteracoes" : "Criar agendamento"}
              </button>
              <button
                className="rounded-2xl border border-ink/10 bg-white px-5 py-3 text-sm text-ink/70 transition hover:bg-ink hover:text-cream"
                onClick={onClose}
                type="button"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function Agenda() {
  const { barbershop, whatsappConnection } = useBarbershop();
  const [selectedDate, setSelectedDate] = useState(getToday());
  const [agendamentos, setAgendamentos] = useState([]);
  const [servicos, setServicos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [modalType, setModalType] = useState(null);
  const [modalAppointment, setModalAppointment] = useState(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [form, setForm] = useState(getInitialForm(getToday()));

  const defaultServiceName = useMemo(
    () => servicos[0]?.nome || "Corte",
    [servicos]
  );

  async function loadAgendamentos(date = selectedDate) {
    setLoading(true);
    setError("");

    try {
      const response = await apiFetch(
        `/agendamentos?data=${encodeURIComponent(date)}`
      );
      setAgendamentos(response);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!barbershop?.id) {
      return;
    }
    loadAgendamentos();
  }, [barbershop?.id, selectedDate]);

  useEffect(() => {
    if (!barbershop?.id) {
      return;
    }

    async function loadServicos() {
      try {
        const response = await apiFetch("/servicos");
        setServicos(response);
      } catch (err) {
        setError(err.message);
      }
    }

    loadServicos();
  }, [barbershop?.id]);

  function closeModal() {
    setModalType(null);
    setModalAppointment(null);
    setForm(getInitialForm(selectedDate, defaultServiceName));
  }

  function openNewAppointmentModal() {
    setForm(getInitialForm(selectedDate, defaultServiceName));
    setModalAppointment(null);
    setModalType("create");
  }

  function openEditModal(agendamento) {
    setForm({
      nome: agendamento.nome,
      telefone: agendamento.telefone,
      data: formatDate(agendamento.data),
      hora: agendamento.hora,
      servico: agendamento.servico
    });
    setModalAppointment(agendamento);
    setModalType("edit");
  }

  function openViewModal(agendamento) {
    setModalAppointment(agendamento);
    setModalType("view");
  }

  function handleFormChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleModalSubmit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);

    try {
      if (modalType === "create") {
        await apiFetch("/agendar", {
          method: "POST",
          body: JSON.stringify({
            ...form,
            barbeariaId: barbershop?.id
          })
        });
        setSuccess(`Agendamento criado para ${formatDateLabel(form.data)} as ${form.hora}.`);
      }

      if (modalType === "edit" && modalAppointment) {
        await apiFetch(`/agendamento/${modalAppointment.id}`, {
          method: "PUT",
          body: JSON.stringify(form)
        });
        setSuccess(`Agendamento ${modalAppointment.id} atualizado com sucesso.`);
      }

      setSelectedDate(form.data);
      closeModal();
      await loadAgendamentos(form.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const qrPageUrl = whatsappConnection?.qrPageUrl
    ? buildChatbotUrl(whatsappConnection.qrPageUrl)
    : buildChatbotUrl("/qr");

  async function handleCancel(agendamento) {
    const confirmed = window.confirm(
      `Deseja cancelar o agendamento de ${agendamento.nome} as ${agendamento.hora}?`
    );

    if (!confirmed) return;

    setError("");
    setSuccess("");

    try {
      await apiFetch(`/agendamento/${agendamento.id}`, {
        method: "DELETE"
      });
      setSuccess(`Agendamento ${agendamento.id} cancelado.`);
      await loadAgendamentos();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleComplete(agendamento) {
    const confirmed = window.confirm(
      `Confirmar que o atendimento de ${agendamento.nome} foi finalizado?`
    );

    if (!confirmed) return;

    setError("");
    setSuccess("");

    try {
      await apiFetch(`/agendamento/${agendamento.id}/concluir`, {
        method: "POST"
      });
      setSuccess(
        `Atendimento finalizado e mensagem de agradecimento enviada para ${agendamento.nome}.`
      );
      await loadAgendamentos();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="flex flex-col gap-10">
      <Topbar title="Agenda diaria" subtitle="Agenda" />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-700">{success}</p> : null}

      <AppointmentModal
        agendamento={modalAppointment}
        form={form}
        onChange={handleFormChange}
        onClose={closeModal}
        onSubmit={handleModalSubmit}
        saving={saving}
        servicos={servicos.length ? servicos : [{ id: "default", nome: defaultServiceName }]}
        type={modalType}
      />
      <WhatsAppQrModal
        isOpen={showQrModal}
        onClose={() => setShowQrModal(false)}
        qrPageUrl={qrPageUrl}
        sessionName={whatsappConnection?.session_name}
      />

      <div className="glass rounded-3xl p-8 shadow-soft">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-3">
            <p className="text-sm text-ink/60">
              Visualizacao em tempo real da agenda.
            </p>
            <input
              className="px-4 py-3 rounded-2xl bg-white/70 border border-ink/10"
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              className="bg-white/80 border border-ink/10 rounded-2xl px-5 py-3 text-sm"
              onClick={() => setShowQrModal(true)}
              type="button"
            >
              Abrir QR do WhatsApp
            </button>
            <a
              className="text-xs text-ink/60 underline-offset-4 hover:underline"
              href={qrPageUrl}
              target="_blank"
              rel="noreferrer"
            >
              Abrir QR em nova aba
            </a>
            <button
              className="bg-ink text-cream rounded-2xl px-5 py-3 text-sm"
              onClick={openNewAppointmentModal}
              type="button"
            >
              Novo agendamento
            </button>
          </div>
        </div>
        <div className="mt-5 rounded-2xl bg-white/55 border border-ink/5 px-4 py-3">
          <p className="text-sm text-ink/70">
            Servicos disponiveis para faturamento:{" "}
            {servicos.length ? servicos.map((item) => item.nome).join(", ") : "carregando..."}
          </p>
        </div>
        <div className="mt-6 overflow-x-auto">
          {loading ? <p className="text-sm text-ink/60">Carregando agenda...</p> : null}
          {!loading && !agendamentos.length ? (
            <p className="text-sm text-ink/60">Nenhum agendamento para esta data.</p>
          ) : null}
          {!loading && agendamentos.length ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink/60">
                  <th className="py-3">Hora</th>
                  <th className="py-3">Cliente</th>
                  <th className="py-3">Servico</th>
                  <th className="py-3">Status</th>
                  <th className="py-3">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {agendamentos.map((row) => (
                  <tr key={row.id} className="border-t border-ink/5">
                    <td className="py-4">{row.hora}</td>
                    <td className="py-4">{row.nome}</td>
                    <td className="py-4">{row.servico}</td>
                    <td className="py-4">
                      <span
                        className={`px-3 py-1 rounded-full text-xs ${statusBadgeClass(
                          row.status
                        )}`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="py-4 flex gap-2">
                      {row.status !== "concluido" && row.status !== "cancelado" ? (
                        <button
                          className="px-3 py-2 rounded-xl bg-emerald-600 text-white"
                          onClick={() => handleComplete(row)}
                          type="button"
                        >
                          Finalizar
                        </button>
                      ) : null}
                      <button
                        className="px-3 py-2 rounded-xl bg-white/70 border border-ink/10"
                        onClick={() => openEditModal(row)}
                        type="button"
                      >
                        Editar
                      </button>
                      <button
                        className="px-3 py-2 rounded-xl bg-white/70 border border-ink/10"
                        onClick={() => handleCancel(row)}
                        type="button"
                      >
                        Cancelar
                      </button>
                      <button
                        className="px-3 py-2 rounded-xl bg-ink text-cream"
                        onClick={() => openViewModal(row)}
                        type="button"
                      >
                        Ver cliente
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      </div>
    </section>
  );
}
