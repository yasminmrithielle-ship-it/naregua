const API_URL = String(import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");
const SESSION_STORAGE_KEY = "barbergo_session";
const SESSION_EVENT = "barbergo-session-change";

function getApiConnectionHelp() {
  if (!API_URL) {
    return "";
  }

  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(API_URL)) {
    return " Em builds mobile, configure VITE_API_URL com a URL publica da API.";
  }

  return "";
}

export function buildApiUrl(path = "") {
  if (!path) {
    return API_URL || "";
  }

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return `${API_URL}${path}`;
}

export function getStoredSession() {
  const raw = localStorage.getItem(SESSION_STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
}

export function setStoredSession(session) {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  window.dispatchEvent(new Event(SESSION_EVENT));
}

export function clearStoredSession() {
  localStorage.removeItem(SESSION_STORAGE_KEY);
  window.dispatchEvent(new Event(SESSION_EVENT));
}

export function getToken() {
  return getStoredSession()?.token || null;
}

export async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response;

  try {
    response = await fetch(buildApiUrl(path), {
      ...options,
      headers
    });
  } catch (error) {
    throw new Error(
      `Nao foi possivel conectar com a API. Verifique se o backend esta ligado.${getApiConnectionHelp()}`
    );
  }

  if (!response.ok) {
    const errorJson = await response.json().catch(() => null);
    const errorText = errorJson?.error || errorJson?.message;

    if (response.status === 401) {
      clearStoredSession();
    }

    if (errorText) {
      throw new Error(errorText);
    }

    throw new Error(`Erro na API (${response.status})`);
  }

  return response.json();
}

export function subscribeToSessionChanges(callback) {
  window.addEventListener(SESSION_EVENT, callback);
  window.addEventListener("storage", callback);

  return () => {
    window.removeEventListener(SESSION_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}
