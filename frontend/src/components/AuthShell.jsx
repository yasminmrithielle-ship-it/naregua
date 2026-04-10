export default function AuthShell({
  eyebrow,
  title,
  description,
  children,
  secondaryAction,
  stats = [],
  highlights = []
}) {
  return (
    <div className="relative min-h-screen overflow-hidden px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-16 top-12 h-44 w-44 rounded-full bg-accent/20 blur-3xl sm:h-64 sm:w-64" />
        <div className="absolute right-0 top-0 h-56 w-56 rounded-full bg-mint/25 blur-3xl sm:h-72 sm:w-72" />
        <div className="absolute bottom-0 left-1/3 h-48 w-48 rounded-full bg-ocean/10 blur-3xl sm:h-64 sm:w-64" />
      </div>

      <div className="relative mx-auto grid min-h-[calc(100vh-3rem)] max-w-7xl gap-6 lg:grid-cols-[1.12fr_0.88fr]">
        <section className="glass shadow-soft rounded-[2rem] p-6 sm:p-8 lg:p-10 flex flex-col gap-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-ink/55">
                Barber Go SaaS
              </p>
              <h1 className="font-display text-3xl mt-4 max-w-xl sm:text-4xl lg:text-5xl">
                {title}
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-ink/65 sm:text-base">
                {description}
              </p>
            </div>
            <div className="hidden h-16 w-16 shrink-0 rounded-3xl bg-ink text-cream md:grid place-items-center font-display text-2xl">
              BG
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {stats.map((item) => (
              <div
                key={item.label}
                className="rounded-3xl border border-ink/5 bg-white/60 px-5 py-5"
              >
                <p className="text-[11px] uppercase tracking-[0.24em] text-ink/50">
                  {item.label}
                </p>
                <p className="mt-4 font-display text-2xl text-ink">{item.value}</p>
                <p className="mt-2 text-sm text-ink/60">{item.description}</p>
              </div>
            ))}
          </div>

          <div className="grid flex-1 gap-5 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="rounded-[1.75rem] bg-ink p-6 text-cream sm:p-8 flex flex-col justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-cream/60">
                  {eyebrow}
                </p>
                <h2 className="mt-4 font-display text-2xl sm:text-3xl">
                  Mesmo clima visual do painel, com entrada clara para novos clientes.
                </h2>
              </div>

              <div className="mt-8 space-y-4">
                {highlights.map((item) => (
                  <div
                    key={item.title}
                    className="rounded-3xl border border-white/10 bg-white/5 px-5 py-4"
                  >
                    <p className="text-sm font-medium text-cream">{item.title}</p>
                    <p className="mt-2 text-sm leading-6 text-cream/75">
                      {item.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-ink/8 bg-white/58 p-6 sm:p-8 flex flex-col justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-ink/50">
                  Fluxo de onboarding
                </p>
                <div className="mt-6 space-y-4">
                  <div className="rounded-3xl border border-ink/8 bg-white/75 p-5">
                    <p className="font-medium text-ink">1. Crie ou acesse sua conta</p>
                    <p className="mt-2 text-sm leading-6 text-ink/60">
                      O proprietario entra com email e senha e ja recebe a sessao ativa.
                    </p>
                  </div>
                  <div className="rounded-3xl border border-ink/8 bg-white/75 p-5">
                    <p className="font-medium text-ink">2. Estruture a sua barbearia</p>
                    <p className="mt-2 text-sm leading-6 text-ink/60">
                      Servicos e planos padrao ficam prontos para acelerar a operacao.
                    </p>
                  </div>
                  <div className="rounded-3xl border border-ink/8 bg-white/75 p-5">
                    <p className="font-medium text-ink">3. Comece a vender e agendar</p>
                    <p className="mt-2 text-sm leading-6 text-ink/60">
                      Painel, assinaturas e rotina diaria seguem o mesmo visual do sistema.
                    </p>
                  </div>
                </div>
              </div>

              {secondaryAction ? (
                <div className="mt-8 rounded-3xl border border-accent/20 bg-accent/10 px-5 py-4 text-sm text-ink/70">
                  {secondaryAction}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section className="glass shadow-soft rounded-[2rem] p-5 sm:p-6 lg:p-8 flex items-center">
          <div className="w-full rounded-[1.75rem] border border-ink/6 bg-white/72 p-6 sm:p-8">
            {children}
          </div>
        </section>
      </div>
    </div>
  );
}
