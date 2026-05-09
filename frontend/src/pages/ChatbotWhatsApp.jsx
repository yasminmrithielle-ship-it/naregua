import { useEffect, useState } from "react";
import Topbar from "../components/Topbar.jsx";
import { apiFetch } from "../api.js";

function resolveStatusLabel(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized.includes("conect")) return "Conectado";
  if (normalized.includes("qr")) return "QR disponivel";
  if (normalized.includes("desconect")) return "Desconectado";
  if (normalized.includes("disabled")) return "Desativado";
  return "Aguardando";
}

export default function ChatbotWhatsApp() {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadStatus() {
    setLoading(true);
    setError("");

    try {
      const [status, qr] = await Promise.all([
        apiFetch("/chatbot/status"),
        apiFetch("/chatbot/qr").catch(() => null)
      ]);
      setPayload({
        ...status,
        qr
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  async function runAction(path, message) {
    setWorking(true);
    setError("");
    setSuccess("");

    try {
      await apiFetch(path, {
        method: "POST"
      });
      setSuccess(message);
      await loadStatus();
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  }

  const status = payload?.status?.status || payload?.connection?.runtimeStatus?.status;
  const qrDataUrl = payload?.qr?.qrDataUrl || payload?.status?.qrDataUrl || "";

  return (
    <section className="flex flex-col gap-8">
      <Topbar title="Chatbot WhatsApp" subtitle="Canal da barbearia" />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-700">{success}</p> : null}

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="panel-card p-6">
          <h3 className="font-display text-2xl">Status da sessao</h3>
          {loading ? <p className="mt-4 text-sm muted-copy">Lendo sessao...</p> : null}
          {!loading ? (
            <>
              <div className="mt-5 panel-card-soft p-5">
                <p className="text-xs uppercase tracking-[0.22em] muted-copy">Conexao atual</p>
                <p className="mt-3 font-display text-4xl">{resolveStatusLabel(status)}</p>
                <p className="mt-3 text-sm muted-copy">
                  QR individual, sessao isolada e runtime independente por barbearia.
                </p>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <button
                  className="primary-button"
                  disabled={working}
                  onClick={() => runAction("/chatbot/connect", "Sessao inicializada para esta barbearia.")}
                  type="button"
                >
                  Conectar
                </button>
                <button
                  className="secondary-button"
                  disabled={working}
                  onClick={() => runAction("/chatbot/restart", "Chatbot reiniciado com sucesso.")}
                  type="button"
                >
                  Reiniciar
                </button>
                <button
                  className="secondary-button"
                  disabled={working}
                  onClick={() =>
                    runAction("/chatbot/disconnect", "Sessao desconectada e limpa para novo QR.")
                  }
                  type="button"
                >
                  Desconectar
                </button>
                <button className="secondary-button" onClick={loadStatus} type="button">
                  Atualizar status
                </button>
              </div>
            </>
          ) : null}
        </div>

        <div className="panel-card p-6">
          <h3 className="font-display text-2xl">QR individual da barbearia</h3>
          <p className="mt-2 text-sm muted-copy">
            Abra o WhatsApp no celular do dono da barbearia, toque em aparelhos conectados e escaneie este QR.
          </p>

          <div className="mt-6 panel-card-soft grid place-items-center p-6">
            {qrDataUrl ? (
              <img
                alt="QR do WhatsApp"
                className="w-full max-w-sm rounded-[28px] bg-white p-4"
                src={qrDataUrl}
              />
            ) : (
              <div className="max-w-sm text-center text-sm muted-copy">
                O QR aparece quando a sessao e iniciada e ainda nao esta conectada. Use o botao
                {" "}
                <strong>Conectar</strong> para gerar uma autenticacao nova.
              </div>
            )}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="panel-card-soft p-4 text-sm">
              <p className="font-medium">1. Gere a sessao</p>
              <p className="mt-2 muted-copy">Toque em conectar.</p>
            </div>
            <div className="panel-card-soft p-4 text-sm">
              <p className="font-medium">2. Escaneie</p>
              <p className="mt-2 muted-copy">Use o telefone oficial da barbearia.</p>
            </div>
            <div className="panel-card-soft p-4 text-sm">
              <p className="font-medium">3. Valide</p>
              <p className="mt-2 muted-copy">Veja o status mudar para conectado.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
