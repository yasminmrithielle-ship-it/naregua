# Agenda Barber SaaS

Plataforma multi-barbearia em monorepo com:

- `backend`: Node.js + Express + PostgreSQL/Supabase
- `frontend`: React + Vite + Tailwind + Capacitor
- `chatbot`: `whatsapp-web.js` com gerenciador de sessoes por tenant

## O que mudou

- Autenticacao trocada para JWT com `JWT_SECRET` obrigatorio.
- Cadastro SaaS via `POST /auth/register` cria barbearia, owner e assinatura trial.
- Tenant principal padronizado em `barbearia_id`.
- Chatbot agora suporta multiplas sessoes independentes por barbearia.
- Painel admin virou shell SaaS mobile-first em `/app/...`.
- Android preparado com Capacitor e app id `com.visionsoft.agendabarber`.

## Fluxo principal

1. Dono cria conta em `/cadastro`.
2. Backend cria:
   - `barbearias`
   - `usuarios`
   - `barbearia_usuarios`
   - `conexoes_whatsapp`
   - `planos_saas`
   - `assinaturas_saas`
3. Frontend autentica com JWT e abre `/app/onboarding`.
4. A barbearia configura servicos, horarios e WhatsApp.
5. O chatbot agenda apenas no tenant vinculado a sua sessao.

## Rotas principais

### Auth

- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`
- `POST /auth/logout`
- `POST /auth/switch-barbershop`

### SaaS admin

- `GET /dashboard`
- `GET /agendamentos`
- `POST /agendar`
- `POST /agendamentos`
- `GET /horarios`
- `GET /servicos`
- `GET /clientes`
- `GET /barbeiros`
- `GET /relatorios/resumo`
- `GET /relatorios/advanced`
- `GET /configuracoes/barbearia`
- `GET /chatbot/status`
- `GET /chatbot/qr`
- `POST /chatbot/connect`
- `POST /chatbot/restart`
- `POST /chatbot/disconnect`

### Rotas internas do chatbot

- `GET /internal/chatbot/context`
- `GET /internal/chatbot/days`
- `GET /internal/chatbot/hours`
- `GET /internal/chatbot/appointments`
- `POST /internal/chatbot/appointments`
- `DELETE /internal/chatbot/appointments/:id`
- `POST /internal/chatbot/connections/sync`

## Assinatura SaaS

Estrutura pronta para monetizacao:

- `planos_saas`
- `assinaturas_saas`

Recursos bloqueaveis quando a assinatura estiver cancelada ou expirada:

- chatbot
- criacao de novos agendamentos
- relatorios avancados

## Desenvolvimento local

1. Copie `.env.example` para seu `.env`.
2. Ajuste `DATABASE_URL`, `JWT_SECRET` e `CHATBOT_INTERNAL_SECRET`.
3. Rode `npm install`.
4. Rode `npm run build --workspace frontend`.
5. Rode `npm start`.

Frontend dev isolado:

- `npm run dev --workspace frontend`

Chatbot isolado:

- `npm run chatbot:start`

## Observacoes de migracao

- O schema foi atualizado de forma progressiva para manter compatibilidade com agendamentos, lembretes e assinaturas ja existentes.
- Campos legados como `phone`/`telefone`, `servico`/`servico_nome` e `password_hash`/`senha_hash` convivem durante a migracao.
- O painel usa rotas de pagina em `/app/...` para nao conflitar com as rotas JSON da API.
