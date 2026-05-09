# Deploy online com Docker

Este deploy sobe:

- `caddy`: proxy reverso com HTTPS automatico.
- `app`: backend Node, frontend React compilado e chatbot WhatsApp integrado.
- `postgres`: banco PostgreSQL 16 em Docker.
- volumes persistentes para Postgres e sessao do WhatsApp.

## Requisitos no servidor

- VPS Linux com Docker e Docker Compose.
- Porta `80/443` liberada se usar proxy reverso.
- Dominio apontando para o IP do servidor.

## Subir em producao

1. Copie `.env.production.example` para `.env.production`.
2. Edite `PUBLIC_HOST`, `PUBLIC_URL`, `POSTGRES_PASSWORD`, `JWT_SECRET` e `CHATBOT_INTERNAL_SECRET`.
3. Suba os containers:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

4. Confira saude da aplicacao:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
curl http://127.0.0.1:5000/health
```

5. Acesse `PUBLIC_URL` no navegador. O Caddy publica a aplicacao em `80/443`.

## Login inicial

O seed inicial cria o usuario definido em:

```env
SEED_OWNER_EMAIL=admin
SEED_OWNER_PASSWORD=admin
```

Para producao real, troque estes valores antes de subir.

## Dominio e HTTPS

O arquivo `Caddyfile` usa `PUBLIC_HOST` para gerar HTTPS automatico:

```env
PUBLIC_HOST=seudominio.com
PUBLIC_URL=https://seudominio.com
```

O DNS do dominio precisa apontar para o IP da VPS antes de subir o Caddy.

## WhatsApp

Com `CHATBOT_ENABLED=true`, a sessao do WhatsApp roda no container `app`.
O QR fica no painel, em `WhatsApp`.

As pastas abaixo sao persistidas em volumes Docker:

- `/app/chatbot/.wwebjs_auth`
- `/app/chatbot/.wwebjs_cache`

Isso evita perder a sessao do WhatsApp ao reiniciar o container.
