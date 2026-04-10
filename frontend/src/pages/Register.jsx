import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthShell from "../components/AuthShell.jsx";
import { useAuth } from "../hooks/useAuth.js";

const initialForm = {
  name: "",
  email: "",
  password: "",
  confirmPassword: "",
  barbershopName: "",
  whatsappNumber: "",
  phone: "",
  address: "",
  logoUrl: "",
  slug: ""
};

const allFields = Object.keys(initialForm);
const requiredFields = ["name", "email", "password", "confirmPassword", "barbershopName"];

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function formatPhoneNumber(value) {
  const digits = onlyDigits(value).slice(0, 11);

  if (!digits) {
    return "";
  }

  if (digits.length <= 2) {
    return `(${digits}`;
  }

  if (digits.length <= 6) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  }

  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function normalizeSlug(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function isValidHttpUrl(value) {
  try {
    const parsed = new URL(String(value || "").trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch (error) {
    return false;
  }
}

function validateField(field, form) {
  const value = String(form[field] || "");

  switch (field) {
    case "name":
      return value.trim().length >= 2 ? "" : "Informe o nome do proprietario.";
    case "email":
      if (!value.trim()) {
        return "Informe o email da conta.";
      }

      return isValidEmail(value) ? "" : "Digite um email valido.";
    case "password":
      return value.length >= 6 ? "" : "A senha precisa ter no minimo 6 caracteres.";
    case "confirmPassword":
      if (!value) {
        return "Confirme a senha para continuar.";
      }

      return value === form.password ? "" : "As senhas nao conferem.";
    case "barbershopName":
      return value.trim().length >= 2 ? "" : "Informe o nome da barbearia.";
    case "whatsappNumber":
    case "phone": {
      const digits = onlyDigits(value);

      if (!digits) {
        return "";
      }

      return digits.length >= 10 ? "" : "Digite um numero com DDD.";
    }
    case "address":
      if (!value.trim()) {
        return "";
      }

      return value.trim().length >= 8 ? "" : "Complete melhor o endereco.";
    case "logoUrl":
      if (!value.trim()) {
        return "";
      }

      return isValidHttpUrl(value)
        ? ""
        : "Use uma URL valida iniciando com http:// ou https://.";
    case "slug":
      if (!value.trim()) {
        return "";
      }

      return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
        ? ""
        : "Use apenas minusculas, numeros e hifens.";
    default:
      return "";
  }
}

function validateForm(form) {
  return allFields.reduce((accumulator, field) => {
    const error = validateField(field, form);

    if (error) {
      accumulator[field] = error;
    }

    return accumulator;
  }, {});
}

function buildVisibleErrors(form, touched) {
  return Object.keys(touched).reduce((accumulator, field) => {
    if (!touched[field]) {
      return accumulator;
    }

    const error = validateField(field, form);

    if (error) {
      accumulator[field] = error;
    }

    return accumulator;
  }, {});
}

function getInputClassName({ field, form, touched, errors }) {
  const baseClassName =
    "rounded-2xl border px-4 py-3 text-ink outline-none transition focus:ring-2";
  const hasValue = Boolean(String(form[field] || "").trim());

  if (touched[field] && errors[field]) {
    return `${baseClassName} border-red-300 bg-red-50/80 focus:border-red-400 focus:ring-red-100`;
  }

  if (touched[field] && hasValue) {
    return `${baseClassName} border-mint/60 bg-mint/15 focus:border-mint focus:ring-mint/25`;
  }

  return `${baseClassName} border-ink/10 bg-white/80 focus:border-ink/30 focus:ring-accent/20`;
}

function getFieldMessage(field, form, touched, errors) {
  if (errors[field]) {
    return {
      toneClassName: "text-red-600",
      text: errors[field]
    };
  }

  if (!touched[field]) {
    const idleMessages = {
      password: "Minimo de 6 caracteres.",
      confirmPassword: "Repita a senha criada acima.",
      whatsappNumber: "Opcional. Ex.: (11) 99999-9999.",
      phone: "Opcional. Ex.: (11) 3333-4444.",
      slug: "Opcional. Usamos isso para criar um identificador amigavel.",
      logoUrl: "Opcional. Pode ser a URL publica da logo da barbearia."
    };

    return idleMessages[field]
      ? {
          toneClassName: "text-ink/45",
          text: idleMessages[field]
        }
      : null;
  }

  if (!String(form[field] || "").trim()) {
    return null;
  }

  const successMessages = {
    name: "Nome pronto.",
    email: "Email validado.",
    password: "Senha pronta para cadastro.",
    confirmPassword: "Senhas conferem.",
    barbershopName: "Nome da barbearia pronto.",
    whatsappNumber: "WhatsApp formatado.",
    phone: "Telefone formatado.",
    address: "Endereco preenchido.",
    slug: "Slug pronto para uso.",
    logoUrl: "Logo URL validada."
  };

  return successMessages[field]
    ? {
        toneClassName: "text-emerald-700",
        text: successMessages[field]
      }
    : null;
}

export default function Register() {
  const navigate = useNavigate();
  const { isAuthenticated, register } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/dashboard", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  function updateField(field, value) {
    const nextValue =
      field === "phone" || field === "whatsappNumber"
        ? formatPhoneNumber(value)
        : field === "slug"
          ? normalizeSlug(value)
          : value;

    const nextForm = {
      ...form,
      [field]: nextValue
    };

    setForm(nextForm);

    if (Object.keys(touched).length) {
      setErrors(buildVisibleErrors(nextForm, touched));
    }
  }

  function handleBlur(field) {
    const nextTouched = {
      ...touched,
      [field]: true
    };

    setTouched(nextTouched);
    setErrors(buildVisibleErrors(form, nextTouched));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitError("");

    const nextTouched = allFields.reduce((accumulator, field) => {
      accumulator[field] = true;
      return accumulator;
    }, {});
    const nextErrors = validateForm(form);

    setTouched(nextTouched);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length) {
      setSubmitError("Revise os campos destacados para continuar.");
      return;
    }

    setLoading(true);

    try {
      await register({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        barbershopName: form.barbershopName.trim(),
        whatsappNumber: form.whatsappNumber.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        logoUrl: form.logoUrl.trim(),
        slug: form.slug.trim()
      });
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const requiredFieldsReady = requiredFields.filter(
    (field) => !validateField(field, form)
  ).length;

  return (
    <AuthShell
      eyebrow="Novo cadastro"
      title="Crie sua barbearia no Barber Go"
      description="Abra sua conta, gere a estrutura inicial da barbearia e entre direto no painel com o mesmo design da aplicacao."
      secondaryAction={
        <span>
          Ja possui acesso?{" "}
          <Link className="font-medium text-ink underline underline-offset-4" to="/">
            Voltar para login
          </Link>
        </span>
      }
      stats={[
        {
          label: "Setup",
          value: "Starter",
          description: "Cadastro inicial com plano padrao e estrutura pronta para crescer."
        },
        {
          label: "Sessao",
          value: "Imediata",
          description: "Apos concluir o cadastro, a conta ja entra autenticada no painel."
        },
        {
          label: "Tenant",
          value: "Isolado",
          description: "Cada barbearia nasce com slug unico e operacao separada."
        }
      ]}
      highlights={[
        {
          title: "Onboarding enxuto",
          description: "Campos principais primeiro, com espaco para detalhes operacionais logo no cadastro."
        },
        {
          title: "Visual consistente",
          description: "Mesmas superficies, contrastes e linguagem do resto da plataforma para manter unidade."
        }
      ]}
    >
      <p className="text-xs uppercase tracking-[0.28em] text-ink/50">Primeiro acesso</p>
      <h2 className="mt-4 font-display text-3xl">Criar conta</h2>
      <p className="mt-2 text-sm leading-6 text-ink/60">
        Preencha os dados principais para gerar sua conta proprietaria e a estrutura
        inicial da barbearia.
      </p>

      <form className="mt-8 flex flex-col gap-6" onSubmit={handleSubmit}>
        <div className="flex items-center justify-between gap-4 rounded-3xl border border-ink/8 bg-white/60 px-5 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-ink/50">
              Campos obrigatorios
            </p>
            <p className="mt-2 text-sm text-ink/60">
              Complete os dados principais antes de criar a conta.
            </p>
          </div>
          <div className="rounded-2xl bg-ink px-4 py-3 text-sm font-medium text-cream">
            {requiredFieldsReady}/{requiredFields.length}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm text-ink/70 sm:col-span-2">
            Nome do proprietario
            <input
              aria-invalid={Boolean(errors.name)}
              autoComplete="name"
              className={getInputClassName({ field: "name", form, touched, errors })}
              placeholder="Seu nome"
              type="text"
              value={form.name}
              onBlur={() => handleBlur("name")}
              onChange={(event) => updateField("name", event.target.value)}
            />
            {getFieldMessage("name", form, touched, errors) ? (
              <p className={`text-xs ${getFieldMessage("name", form, touched, errors).toneClassName}`}>
                {getFieldMessage("name", form, touched, errors).text}
              </p>
            ) : null}
          </label>

          <label className="flex flex-col gap-2 text-sm text-ink/70">
            Email
            <input
              aria-invalid={Boolean(errors.email)}
              autoComplete="email"
              className={getInputClassName({ field: "email", form, touched, errors })}
              placeholder="voce@barbearia.com"
              type="email"
              value={form.email}
              onBlur={() => handleBlur("email")}
              onChange={(event) => updateField("email", event.target.value)}
            />
            {getFieldMessage("email", form, touched, errors) ? (
              <p className={`text-xs ${getFieldMessage("email", form, touched, errors).toneClassName}`}>
                {getFieldMessage("email", form, touched, errors).text}
              </p>
            ) : null}
          </label>

          <label className="flex flex-col gap-2 text-sm text-ink/70">
            Nome da barbearia
            <input
              aria-invalid={Boolean(errors.barbershopName)}
              autoComplete="organization"
              className={getInputClassName({
                field: "barbershopName",
                form,
                touched,
                errors
              })}
              placeholder="Barbearia Exemplo"
              type="text"
              value={form.barbershopName}
              onBlur={() => handleBlur("barbershopName")}
              onChange={(event) => updateField("barbershopName", event.target.value)}
            />
            {getFieldMessage("barbershopName", form, touched, errors) ? (
              <p
                className={`text-xs ${getFieldMessage("barbershopName", form, touched, errors).toneClassName}`}
              >
                {getFieldMessage("barbershopName", form, touched, errors).text}
              </p>
            ) : null}
          </label>

          <label className="flex flex-col gap-2 text-sm text-ink/70">
            Senha
            <input
              aria-invalid={Boolean(errors.password)}
              autoComplete="new-password"
              className={getInputClassName({ field: "password", form, touched, errors })}
              placeholder="Minimo de 6 caracteres"
              type="password"
              value={form.password}
              onBlur={() => handleBlur("password")}
              onChange={(event) => updateField("password", event.target.value)}
            />
            {getFieldMessage("password", form, touched, errors) ? (
              <p className={`text-xs ${getFieldMessage("password", form, touched, errors).toneClassName}`}>
                {getFieldMessage("password", form, touched, errors).text}
              </p>
            ) : null}
          </label>

          <label className="flex flex-col gap-2 text-sm text-ink/70">
            Confirmar senha
            <input
              aria-invalid={Boolean(errors.confirmPassword)}
              autoComplete="new-password"
              className={getInputClassName({
                field: "confirmPassword",
                form,
                touched,
                errors
              })}
              placeholder="Repita a senha"
              type="password"
              value={form.confirmPassword}
              onBlur={() => handleBlur("confirmPassword")}
              onChange={(event) => updateField("confirmPassword", event.target.value)}
            />
            {getFieldMessage("confirmPassword", form, touched, errors) ? (
              <p
                className={`text-xs ${getFieldMessage("confirmPassword", form, touched, errors).toneClassName}`}
              >
                {getFieldMessage("confirmPassword", form, touched, errors).text}
              </p>
            ) : null}
          </label>
        </div>

        <div className="rounded-3xl border border-ink/8 bg-white/60 p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-ink/50">
            Detalhes opcionais
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm text-ink/70">
              WhatsApp
              <input
                aria-invalid={Boolean(errors.whatsappNumber)}
                autoComplete="tel"
                className={getInputClassName({
                  field: "whatsappNumber",
                  form,
                  touched,
                  errors
                })}
                inputMode="numeric"
                placeholder="(11) 99999-9999"
                type="text"
                value={form.whatsappNumber}
                onBlur={() => handleBlur("whatsappNumber")}
                onChange={(event) => updateField("whatsappNumber", event.target.value)}
              />
              {getFieldMessage("whatsappNumber", form, touched, errors) ? (
                <p
                  className={`text-xs ${getFieldMessage("whatsappNumber", form, touched, errors).toneClassName}`}
                >
                  {getFieldMessage("whatsappNumber", form, touched, errors).text}
                </p>
              ) : null}
            </label>

            <label className="flex flex-col gap-2 text-sm text-ink/70">
              Telefone
              <input
                aria-invalid={Boolean(errors.phone)}
                autoComplete="tel"
                className={getInputClassName({ field: "phone", form, touched, errors })}
                inputMode="numeric"
                placeholder="Telefone comercial"
                type="text"
                value={form.phone}
                onBlur={() => handleBlur("phone")}
                onChange={(event) => updateField("phone", event.target.value)}
              />
              {getFieldMessage("phone", form, touched, errors) ? (
                <p className={`text-xs ${getFieldMessage("phone", form, touched, errors).toneClassName}`}>
                  {getFieldMessage("phone", form, touched, errors).text}
                </p>
              ) : null}
            </label>

            <label className="flex flex-col gap-2 text-sm text-ink/70 sm:col-span-2">
              Endereco
              <input
                aria-invalid={Boolean(errors.address)}
                autoComplete="street-address"
                className={getInputClassName({ field: "address", form, touched, errors })}
                placeholder="Rua, numero e bairro"
                type="text"
                value={form.address}
                onBlur={() => handleBlur("address")}
                onChange={(event) => updateField("address", event.target.value)}
              />
              {getFieldMessage("address", form, touched, errors) ? (
                <p className={`text-xs ${getFieldMessage("address", form, touched, errors).toneClassName}`}>
                  {getFieldMessage("address", form, touched, errors).text}
                </p>
              ) : null}
            </label>

            <label className="flex flex-col gap-2 text-sm text-ink/70">
              Slug
              <input
                aria-invalid={Boolean(errors.slug)}
                className={getInputClassName({ field: "slug", form, touched, errors })}
                placeholder="minha-barbearia"
                type="text"
                value={form.slug}
                onBlur={() => handleBlur("slug")}
                onChange={(event) => updateField("slug", event.target.value)}
              />
              {getFieldMessage("slug", form, touched, errors) ? (
                <p className={`text-xs ${getFieldMessage("slug", form, touched, errors).toneClassName}`}>
                  {getFieldMessage("slug", form, touched, errors).text}
                </p>
              ) : null}
            </label>

            <label className="flex flex-col gap-2 text-sm text-ink/70">
              Logo URL
              <input
                aria-invalid={Boolean(errors.logoUrl)}
                autoComplete="url"
                className={getInputClassName({ field: "logoUrl", form, touched, errors })}
                placeholder="https://..."
                type="url"
                value={form.logoUrl}
                onBlur={() => handleBlur("logoUrl")}
                onChange={(event) => updateField("logoUrl", event.target.value)}
              />
              {getFieldMessage("logoUrl", form, touched, errors) ? (
                <p className={`text-xs ${getFieldMessage("logoUrl", form, touched, errors).toneClassName}`}>
                  {getFieldMessage("logoUrl", form, touched, errors).text}
                </p>
              ) : null}
            </label>
          </div>
        </div>

        {submitError ? <p className="text-sm text-red-600">{submitError}</p> : null}

        <button
          className="rounded-2xl bg-ink py-3 font-medium text-cream transition hover:bg-ocean disabled:cursor-not-allowed disabled:opacity-60"
          disabled={loading}
          type="submit"
        >
          {loading ? "Criando conta..." : "Criar conta"}
        </button>
      </form>

      <p className="mt-6 text-sm text-ink/60">
        Ja tem uma conta?{" "}
        <Link className="font-medium text-ink underline underline-offset-4" to="/">
          Entrar agora
        </Link>
      </p>
    </AuthShell>
  );
}
