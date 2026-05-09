# Android Setup

Projeto Android preparado com Capacitor para o app:

- `appId`: `com.visionsoft.agendabarber`
- `appName`: `Agenda Barber`

## Pre-requisitos

1. Node.js 20
2. Android Studio
3. SDK Android instalado no Android Studio
4. Java configurado pelo proprio Android Studio

## Instalar dependencias

Na raiz do monorepo:

```bash
npm install
```

## Variaveis importantes

No app Android, `VITE_API_URL` precisa apontar para uma URL publica acessivel pelo celular.

Exemplo:

```env
VITE_API_URL=https://sua-api-publica.com
VITE_CHATBOT_URL=https://sua-api-publica.com
```

## Gerar build web e sincronizar Android

```bash
npm run build --workspace frontend
npm run mobile:sync
```

## Primeira geracao do projeto Android

Se precisar recriar a camada nativa:

```bash
npm install @capacitor/core @capacitor/cli --workspace frontend
npx cap init Agenda Barber com.visionsoft.agendabarber --web-dir dist
npx cap add android
npx cap sync android
```

Observacao:

- Neste repositorio a pasta `frontend/android` ja existe, entao normalmente basta usar `npm run mobile:sync`.

## Abrir no Android Studio

```bash
npm run mobile:open:android
```

Alternativa:

- Abra manualmente a pasta `frontend/android` no Android Studio.

## Testar no celular

1. Conecte um dispositivo Android com depuracao USB ativa.
2. Ou crie um emulador no Android Studio.
3. Rode o app pelo botao Run do Android Studio.
4. Garanta que a API esteja publica e com HTTPS quando testar fora da maquina local.

## Alterar icone e splash

Arquivos atuais:

- Icones: `frontend/android/app/src/main/res/mipmap-*`
- Splash: `frontend/android/app/src/main/res/drawable*/splash.png`
- Manifesto web: `frontend/public/manifest.webmanifest`

Fluxo recomendado:

1. Gere novos assets quadrados em 1024x1024.
2. Substitua os `mipmap-*` e `splash.png`.
3. Rode `npm run mobile:sync`.
4. Reabra o projeto no Android Studio se necessario.

## Comandos uteis

```bash
npm run mobile:add:android
npm run mobile:copy
npm run mobile:sync
npm run mobile:open:android
```
