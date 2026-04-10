# Sistema de Agendamentos para Barbearia

Este projeto possui 3 camadas principais:

1. API / Backend (`backend`)
2. Painel Admin (`frontend`)
3. Integracao com chatbot via API (`backend/src/integrations/chatbotAdapter.js`)

## Deploy no Railway

O repositorio foi preparado para deploy pelo root no Railway.

- Build command: `npm run build`
- Start command: `npm start`
- Node: `20.x` via `.nvmrc`
- Healthcheck: `/health`

Arquivos de exemplo para deploy:

- `.env.railway.app.example`: servico principal no Railway
- `.env.railway.chatbot.example`: chatbot WhatsApp em servico separado e opcional

### Checklist de deploy

1. Crie um servico no Railway apontando para a raiz do repositorio.
2. Configure as variaveis com base em `.env.railway.app.example`.
3. Em `DATABASE_URL`, use a URI real de `Connection Pooling` do Supabase.
4. Nao use `db.<projeto>.supabase.co` no Railway.
5. Defina `API_URL` com `https://`.
6. Faca o deploy.
7. Verifique `https://seu-app.up.railway.app/health`.

### Variaveis recomendadas no Railway

- `PORT`: definido automaticamente pelo Railway
- `DATABASE_URL`: URI do pooler do Supabase
- `DATABASE_SSL`: `true`
- `DATABASE_POOL_MAX`: `10`
- `DATABASE_CONNECTION_TIMEOUT_MS`: `15000`
- `DATABASE_IDLE_TIMEOUT_MS`: `30000`
- `ADMIN_USER`: usuario do painel
- `ADMIN_PASS`: senha do painel
- `BARBEARIA_ID`: identificador da barbearia, ex. `default`
- `BARBEARIA_NOME`: nome exibido no sistema
- `API_URL`: URL publica da aplicacao, ex. `https://seu-app.railway.app`
- `CHATBOT_PUBLIC_URL`: URL publica do servico separado do chatbot, ex. `https://seu-chatbot.up.railway.app`
- `CHATBOT_WEBHOOK_URL`: opcional, URL do webhook do chatbot
- `CHATBOT_ENABLED`: `false` por padrao no Railway

### Observacoes de deploy

- O frontend e compilado no build e servido pelo backend em producao.
- O frontend usa a mesma origem da aplicacao por padrao, entao `VITE_API_URL` pode ficar vazio.
- Se o chatbot estiver em outro servico do Railway, configure `CHATBOT_PUBLIC_URL` no servico principal para o painel abrir o QR no dominio certo.
- O backend aplica o schema automaticamente ao iniciar.
- O backend valida as variaveis criticas e falha cedo com mensagens mais claras de configuracao.
- O modulo de WhatsApp foi deixado opcional no servidor para evitar falhas de deploy em ambientes sem Chromium ou sessao persistente.
- Se quiser executar o chatbot no Railway, use um servico separado e habilite `CHATBOT_ENABLED=true` apenas em ambiente compativel.
- Se quiser rodar tudo no mesmo servico, mantenha o repositorio em um unico deploy e defina `CHATBOT_ENABLED=true`.
- O workspace raiz agora instala `backend`, `frontend` e `chatbot`, permitindo deploy unificado quando o ambiente suportar o WhatsApp.

## Backend

- Tecnologias: Node.js + Express + PostgreSQL
- Compativel com Supabase Postgres via `DATABASE_URL`
- Endpoints principais:
  - `GET /health`
  - `GET /horarios-disponiveis?data=YYYY-MM-DD`
  - `POST /agendar`
  - `GET /agendamentos`
  - `DELETE /agendamento/:id`
  - `PUT /agendamento/:id`
  - `POST /horarios`
  - `GET /relatorios/resumo`

Para usar com Supabase localmente:

1. Preencha `backend/.env`.
2. Se estiver rodando localmente, a URI direta `db.<projeto>.supabase.co` pode ser usada.
3. No Railway, use a URI de `Connection Pooling`.
4. Rode `npm run db:apply-schema --workspace backend` se quiser aplicar manualmente.

Schema do banco:

- `backend/src/sql/schema.sql`

## Frontend

- React + TailwindCSS
- Telas: login, dashboard, agenda, horarios e servicos
- `VITE_API_URL` pode ficar vazio quando frontend e backend estao no mesmo servico
- O frontend agora tambem pode ser instalado como PWA

### Empacotar frontend como app Android com Capacitor

1. Entre em `frontend` ou rode os scripts da raiz.
2. Defina `frontend/.env` com `VITE_API_URL=https://sua-api-publica`.
3. Rode `npm run mobile:add:android` na primeira vez para gerar o projeto Android.
4. Rode `npm run mobile:sync` sempre que atualizar o frontend.
5. Rode `npm run mobile:open:android` para abrir no Android Studio.

Observacoes para mobile:

- Diferente do deploy web, no app mobile `VITE_API_URL` nao deve ficar vazio.
- Use uma URL publica acessivel pelo celular, de preferencia `https://`.
- O projeto Android fica em `frontend/android` depois do `add android`.

## Integracao com Chatbot

O arquivo `backend/src/integrations/chatbotAdapter.js` recebe o webhook.
Substitua a logica pelo codigo do seu chatbot quando estiver pronto.

## Chatbot WhatsApp

O chatbot foi preparado em `chatbot/robo.js` usando a base enviada por voce.
Ele conversa com a API para buscar horarios e criar agendamentos.

### Rodar local integrado

1. Configure `backend/.env` com `API_URL=http://localhost:5000`, `CHATBOT_ENABLED=true`, `CHATBOT_PUBLIC_URL=http://localhost:5000`, `CHATBOT_WEBHOOK_URL=http://localhost:5000/webhook` e o mesmo `CHATBOT_INTERNAL_SECRET` usado no chatbot.
2. Configure `frontend/.env` com `VITE_API_URL=http://localhost:5000` e `VITE_CHATBOT_URL=http://localhost:5000` quando usar `npm run dev --workspace frontend`.
3. Rode `npm run build` para gerar o painel que o backend serve.
4. Rode `npm start`.
5. Abra `http://localhost:5000/qr` ou o botao "Abrir QR do WhatsApp" no painel.

Ao iniciar, o backend garante automaticamente uma configuracao e uma conexao WhatsApp para cada barbearia ativa que ainda nao tiver uma.

### Publicar chatbot em servico separado no Railway

1. Crie um segundo servico no Railway apontando para este mesmo repositorio.
2. No servico do chatbot, use `npm run chatbot:install` como build command.
3. No servico do chatbot, use `npm run chatbot:start` como start command.
4. Configure as variaveis com base em `.env.railway.chatbot.example`.
5. Aponte `API_URL` para a URL publica do servico principal.
6. Abra `/qr` na URL do servico do chatbot para autenticar o WhatsApp.

Se o servico do chatbot estiver com Root Directory definido como `chatbot`, use estes comandos no Railway:

- Build command: `npm ci --omit=dev`
- Start command: `npm start`

Nao use `npm start --workspace=barbearia-chatbot` quando o Root Directory for `chatbot`, porque o npm so encontra workspaces quando o `package.json` da raiz do repositorio tambem esta presente no container.

Variaveis recomendadas para o servico do chatbot:

- `PORT=3000`
- `API_URL=https://seu-app-principal.up.railway.app`
- `BARBEARIA_ID=default`
- `BARBEARIA_NOME=BARBEARIA DO NEGAO`
- `ADMIN_PASS=sua-senha-admin`

Rotas uteis do servico do chatbot:

- `/qr`
- `/qr.png`
- `/chatbot/status`
- `/webhook`

Variaveis:

- `chatbot/.env`: `API_URL`, `BARBEARIA_ID`, `PORT`, `ADMIN_PASS`
- `backend/.env`: `CHATBOT_WEBHOOK_URL` pode apontar para `http://localhost:3000/webhook`
