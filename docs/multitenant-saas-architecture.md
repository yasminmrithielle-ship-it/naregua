# Barber Go Multi-tenant SaaS

## Etapa 1 - Arquitetura ideal

### Tenant boundary

- O tenant principal da aplicacao e `barbershop_id`.
- Toda operacao administrativa usa a barbearia ativa da sessao autenticada.
- Toda operacao do chatbot/WhatsApp usa a barbearia resolvida por `whatsapp_connections.session_name`.
- Nada no frontend ou no chatbot depende mais de nome fixo de barbearia em codigo.

### Camadas

- `frontend`: autentica usuario, carrega contexto da barbearia ativa e renderiza a marca dinamicamente.
- `backend`: resolve sessao, aplica tenant scope nas rotas protegidas e oferece endpoints internos para o motor do chatbot.
- `chatbot`: sobe uma instancia WhatsApp por `session_name`, busca contexto por conexao e agenda/cancela sempre dentro do tenant correto.
- `database`: separa dados por `barbearia_id` no runtime atual e por `barbershop_id` no schema alvo de Supabase.

### Fluxos chave

#### Painel

1. Usuario faz login.
2. Backend valida email/senha e vinculo em `barbearia_usuarios`.
3. Sessao passa a carregar `membership.barbershopId`.
4. Frontend busca `/barbershop/context`.
5. Sidebar, topbar, QR e dados operacionais passam a ser tenant-aware.

#### Chatbot

1. Mensagem chega em uma sessao WhatsApp.
2. A sessao tem um `session_name`.
3. O chatbot chama `/internal/chatbot/context?sessionName=...`.
4. Backend resolve `conexoes_whatsapp -> barbearia_id`.
5. O bot usa nome, servicos, configuracoes e agenda da conta certa.
6. Inserts e cancelamentos usam sempre o `barbearia_id` desta conexao.

## Etapa 6 - Exemplos praticos

### Login

```http
POST /auth/login
Content-Type: application/json

{
  "email": "dono@barbearia.com",
  "password": "senha-segura"
}
```

### Sessao atual

```http
GET /auth/me
Authorization: Bearer <token>
```

### Listar servicos da conta logada

```http
GET /servicos
Authorization: Bearer <token>
```

### Criar agendamento no painel

```http
POST /agendar
Authorization: Bearer <token>
Content-Type: application/json

{
  "barbeariaId": "tenant-id",
  "nome": "Joao",
  "telefone": "11999999999",
  "data": "2026-04-08",
  "hora": "14:00",
  "servico": "Corte"
}
```

### Carregar contexto do chatbot por sessao

```http
GET /internal/chatbot/context?sessionName=barbearia-centro
x-chatbot-secret: <CHATBOT_INTERNAL_SECRET>
```

### Criar agendamento vindo do WhatsApp

```http
POST /internal/chatbot/appointments
x-chatbot-secret: <CHATBOT_INTERNAL_SECRET>
Content-Type: application/json

{
  "sessionName": "barbearia-centro",
  "nome": "Carlos",
  "telefone": "11988887777",
  "data": "2026-04-09",
  "hora": "16:00",
  "servico": "Barba"
}
```

### Cancelar via chatbot

```http
DELETE /internal/chatbot/appointments/123?sessionName=barbearia-centro
x-chatbot-secret: <CHATBOT_INTERNAL_SECRET>
```

## Etapa 7 - Estrutura sugerida

```text
backend/
  src/
    integrations/
    middleware/
      auth.js
      chatbotInternal.js
    routes/
      admin.js
      chatbot.js
      agendamentos.js
      horarios.js
      servicos.js
      assinaturas.js
      relatorios.js
    services/
      authService.js
      barbershopService.js
      serviceCatalog.js
      subscriptionCatalog.js
      reminderScheduler.js
      reminders.js
      slotExpiry.js
    sql/
      schema.sql
      supabase_saas_multitenant.sql
      supabase_rls.sql

frontend/
  src/
    api.js
    context/
      AuthContext.jsx
      BarbershopContext.jsx
    hooks/
      useAuth.js
      useBarbershop.js
    components/
      Sidebar.jsx
      Topbar.jsx
    pages/
      Login.jsx
      Dashboard.jsx
      Agenda.jsx
      Horarios.jsx
      Servicos.jsx
      Assinaturas.jsx

chatbot/
  robo.js
```

### Hooks e contexts recomendados

- `useAuth`: sessao, login, logout, troca de barbearia.
- `useBarbershop`: branding, configuracoes do bot e conexao WhatsApp ativa.
- `useAppointments`: pode ser extraido depois para consolidar agenda, create/update/cancel.
- `useChatbotSettings`: pode ser extraido depois para futura tela de configuracao do assistente.
