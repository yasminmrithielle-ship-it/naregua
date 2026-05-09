# Deploy no Railway

Este projeto deve ser publicado no Railway como:

- Um servico `app` a partir deste repositorio GitHub.
- Um servico `Postgres` criado pelo template PostgreSQL do Railway.

O Railway usa o `Dockerfile` da raiz para instalar Chromium, compilar o frontend e iniciar o backend com o chatbot integrado.

## Passo a passo

1. No Railway, crie um novo projeto.
2. Adicione um banco em `+ New > Database > PostgreSQL`.
3. Adicione este repositorio GitHub como novo servico.
4. No servico do app, confirme que a branch e `main`.
5. Na aba `Variables` do app, cole as variaveis de `.env.railway.app.example`.
6. Confira se o banco se chama `Postgres`. Se tiver outro nome, ajuste:

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

7. Gere um dominio publico para o app no Railway.
8. Garanta que estas variaveis usem o dominio gerado:

```env
API_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}
CORS_ORIGINS=https://${{RAILWAY_PUBLIC_DOMAIN}},capacitor://localhost
CHATBOT_PUBLIC_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}
CHATBOT_WEBHOOK_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}/webhook
```

9. Faça o deploy.
10. Depois do deploy, abra `/health`.

## WhatsApp

Para manter a sessao do WhatsApp apos redeploy/restart, anexe um Volume no servico do app com mount path:

```text
/app/chatbot/.wwebjs_auth
```

Sem esse volume, o QR pode precisar ser escaneado novamente em cada redeploy.

## Login inicial

As variaveis de seed criam a primeira conta:

```env
SEED_OWNER_EMAIL=admin
SEED_OWNER_PASSWORD=admin
```

Para producao real, troque estes valores antes do primeiro deploy.
