import { createContext, useEffect, useMemo, useState } from "react";
import {
  apiFetch,
  clearStoredSession,
  getStoredSession,
  setStoredSession,
  subscribeToSessionChanges
} from "../api.js";

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => getStoredSession());
  const [loading, setLoading] = useState(true);

  async function refreshSession() {
    const stored = getStoredSession();

    if (!stored?.token) {
      setSession(null);
      setLoading(false);
      return null;
    }

    try {
      const freshSession = await apiFetch("/auth/me");
      const mergedSession = {
        ...freshSession,
        token: stored.token
      };
      setStoredSession(mergedSession);
      setSession(mergedSession);
      return mergedSession;
    } catch (error) {
      clearStoredSession();
      setSession(null);
      return null;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshSession();
  }, []);

  useEffect(() => {
    return subscribeToSessionChanges(() => {
      setSession(getStoredSession());
    });
  }, []);

  async function login(credentials) {
    const nextSession = await apiFetch("/auth/login", {
      method: "POST",
      body: JSON.stringify(credentials)
    });

    setStoredSession(nextSession);
    setSession(nextSession);
    return nextSession;
  }

  async function register(payload) {
    const nextSession = await apiFetch("/auth/register", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    setStoredSession(nextSession);
    setSession(nextSession);
    return nextSession;
  }

  async function logout() {
    try {
      await apiFetch("/auth/logout", {
        method: "POST"
      });
    } catch (error) {
      // O logout local deve acontecer mesmo se a API falhar.
    } finally {
      clearStoredSession();
      setSession(null);
    }
  }

  async function switchBarbershop(barbershopId) {
    const nextSession = await apiFetch("/auth/switch-barbershop", {
      method: "POST",
      body: JSON.stringify({ barbershopId })
    });

    setStoredSession(nextSession);
    setSession(nextSession);
    return nextSession;
  }

  const value = useMemo(
    () => ({
      session,
      user: session?.user || null,
      membership: session?.membership || null,
      memberships: session?.memberships || [],
      barbershop: session?.barbershop || null,
      token: session?.token || null,
      isAuthenticated: Boolean(session?.token),
      loading,
      login,
      register,
      logout,
      refreshSession,
      switchBarbershop
    }),
    [loading, session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
