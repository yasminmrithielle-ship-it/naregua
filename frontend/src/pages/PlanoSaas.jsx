import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import Topbar from "../components/Topbar.jsx";
import { apiFetch } from "../api.js";

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(Number(value || 89.9));
}

export default function PlanoSaas() {
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError("");

      try {
        const response = await apiFetch("/configuracoes/barbearia");
        setSubscription(response.assinaturaSaas || null);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const planPrice = formatCurrency(subscription?.plano_preco);

  return (
    <section className="flex flex-col gap-8">
      <Topbar title="Plano" subtitle="Assinatura" />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="panel-card p-6 xl:col-span-2">
          <h3 className="font-display text-2xl">Conta atual</h3>
          {loading ? <p className="mt-4 text-sm muted-copy">Lendo assinatura...</p> : null}
          {!loading ? (
            <>
              <div className="mt-6 panel-card-soft p-5">
                <p className="text-xs uppercase tracking-[0.22em] muted-copy">Plano ativo</p>
                <p className="mt-3 font-display text-4xl">
                  {subscription?.plano_nome || "Plano"}
                </p>
                <p className="mt-3 text-sm muted-copy">
                  Um unico plano para todas as barbearias, com cobranca mensal de {planPrice}.
                </p>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <div className="panel-card-soft p-4 text-sm">
                  <p className="font-medium">Valor mensal</p>
                  <p className="mt-2 muted-copy">{planPrice} / mes</p>
                </div>
                <div className="panel-card-soft p-4 text-sm">
                  <p className="font-medium">Agendamentos no plano</p>
                  <p className="mt-2 muted-copy">
                    {subscription?.limite_agendamentos || "Ilimitados"}
                  </p>
                </div>
                <div className="panel-card-soft p-4 text-sm">
                  <p className="font-medium">WhatsApp liberado</p>
                  <p className="mt-2 muted-copy">{subscription?.limite_chatbots || 1}</p>
                </div>
              </div>
            </>
          ) : null}
        </div>

        <div className="panel-card p-6">
          <h3 className="font-display text-2xl">Proximos passos</h3>
          <div className="mt-6 grid gap-4">
            <div className="panel-card-soft p-4 text-sm muted-copy">
              Recebimento das mensalidades sera conectado futuramente a sua conta.
            </div>
            <div className="panel-card-soft p-4 text-sm muted-copy">
              Quando a integracao de pagamento entrar, as barbearias pagarao este plano mensal.
            </div>
            <Link className="secondary-button text-center" to="/app/configuracoes">
              Ver configuracoes da conta
            </Link>
            <Link className="primary-button text-center" to="/app/assinaturas">
              Abrir mensalistas da barbearia
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
