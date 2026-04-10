export function registerServiceWorker() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    let refreshing = false;

    function activateUpdate(registration) {
      if (registration.waiting) {
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
      }
    }

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) {
        return;
      }

      refreshing = true;
      window.location.reload();
    });

    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        activateUpdate(registration);
        registration.update().catch(() => {});

        registration.addEventListener("updatefound", () => {
          const installingWorker = registration.installing;

          if (!installingWorker) {
            return;
          }

          installingWorker.addEventListener("statechange", () => {
            if (
              installingWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              activateUpdate(registration);
            }
          });
        });
      })
      .catch(() => {
        // Falha silenciosa para nao impactar o uso normal do painel.
      });
  });
}
