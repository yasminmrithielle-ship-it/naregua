import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthShell from "../components/AuthShell.jsx";
import { useAuth } from "../hooks/useAuth.js";

export default function Login() {
  const navigate = useNavigate();
  const { isAuthenticated, login } = useAuth();
  const [form, setForm] = useState({ login: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/app/dashboard", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login({
        username: form.login,
        password: form.password
      });
      navigate("/app/dashboard", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Acesso rapido"
      title="Acesse sua conta"
      description="Entre com o usuario vinculado a sua barbearia para abrir o painel multiempresa e continuar a operacao de onde parou."
      secondaryAction={
        <span>
          Ainda nao tem conta?{" "}
          <Link className="font-medium text-ink underline underline-offset-4" to="/cadastro">
            Criar cadastro
          </Link>
        </span>
      }
      stats={[
        {
          label: "Agenda",
          value: "24h",
          description: "Controle de atendimentos em uma visao clara e responsiva."
        },
        {
          label: "Assinaturas",
          value: "MRR",
          description: "Mensalidades e recorrencia organizadas no mesmo painel."
        },
        {
          label: "Operacao",
          value: "1 login",
          description: "Sessao unica para administrar a barbearia com fluidez."
        }
      ]}
      highlights={[
        {
          title: "Design consistente",
          description: "Vidro fosco, tipografia forte e blocos claros, igual ao painel principal."
        },
        {
          title: "Acesso direto",
          description: "Depois do login, o usuario ja entra com a barbearia ativa e pronta para operar."
        }
      ]}
    >
      <p className="text-xs uppercase tracking-[0.28em] text-ink/50">Barber Go SaaS</p>
      <h2 className="font-display text-3xl mt-4">Entrar</h2>
      <p className="text-sm text-ink/60 mt-2 leading-6">
        Use as credenciais da sua conta principal para abrir o painel administrativo.
      </p>
      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
        <label className="flex flex-col gap-2 text-sm text-ink/70">
          Login ou email
          <input
            className="rounded-2xl border border-ink/10 bg-white/80 px-4 py-3 text-ink outline-none transition focus:border-ink/30 focus:ring-2 focus:ring-accent/20"
            placeholder="admin"
            type="text"
            value={form.login}
            onChange={(event) => setForm({ ...form, login: event.target.value })}
          />
        </label>
        <label className="flex flex-col gap-2 text-sm text-ink/70">
          Senha
          <input
            className="rounded-2xl border border-ink/10 bg-white/80 px-4 py-3 text-ink outline-none transition focus:border-ink/30 focus:ring-2 focus:ring-accent/20"
            placeholder="admin"
            type="password"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
          />
        </label>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button
          className="rounded-2xl bg-ink py-3 font-medium text-cream transition hover:bg-ocean disabled:cursor-not-allowed disabled:opacity-60"
          disabled={loading}
          type="submit"
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
      <p className="mt-6 text-sm text-ink/60">
        Quer comecar agora?{" "}
        <Link className="font-medium text-ink underline underline-offset-4" to="/cadastro">
          Criar nova conta
        </Link>
      </p>
    </AuthShell>
  );
}
