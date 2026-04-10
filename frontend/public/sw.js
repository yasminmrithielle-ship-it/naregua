const STATIC_CACHE = "barber-go-static-v1";
const RUNTIME_CACHE = "barber-go-runtime-v1";
const APP_SHELL_URL = "/";
const APP_SHELL_ASSETS = [
  "/",
  "/manifest.webmanifest",
  "/offline.html",
  "/icons/icon-192.svg",
  "/icons/icon-512.svg",
  "/icons/icon-maskable.svg"
];
const API_PREFIXES = [
  "/auth",
  "/barbershop",
  "/internal",
  "/horarios",
  "/agendar",
  "/agendamento",
  "/agendamentos",
  "/relatorios",
  "/servicos",
  "/assinaturas",
  "/chatbot",
  "/webhook",
  "/health",
  "/qr",
  "/qr.png"
];

function isAppShellNavigation(request, url) {
  if (request.mode !== "navigate") {
    return false;
  }

  return !API_PREFIXES.some((prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`));
}

function isStaticAsset(request, url) {
  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return false;
  }

  return (
    request.destination === "script" ||
    request.destination === "style" ||
    request.destination === "font" ||
    request.destination === "image" ||
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/icons/")
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(APP_SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => ![STATIC_CACHE, RUNTIME_CACHE].includes(key))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const url = new URL(event.request.url);

  if (isAppShellNavigation(event.request, url)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const cloned = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(APP_SHELL_URL, cloned));
          return response;
        })
        .catch(async () => {
          const cachedShell = await caches.match(APP_SHELL_URL);
          return cachedShell || caches.match("/offline.html");
        })
    );
    return;
  }

  if (isStaticAsset(event.request, url)) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(event.request).then((response) => {
          if (response.ok) {
            const cloned = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(event.request, cloned));
          }
          return response;
        });
      })
    );
  }
});
