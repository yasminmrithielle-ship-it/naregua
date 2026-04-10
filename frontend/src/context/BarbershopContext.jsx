import { createContext, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api.js";
import { useAuth } from "../hooks/useAuth.js";

export const BarbershopContext = createContext(null);

export function BarbershopProvider({ children }) {
  const { isAuthenticated, loading: authLoading, session } = useAuth();
  const [contextValue, setContextValue] = useState(null);
  const [loading, setLoading] = useState(true);

  async function refreshBarbershopContext() {
    if (!isAuthenticated) {
      setContextValue(null);
      setLoading(false);
      return null;
    }

    try {
      const payload = await apiFetch("/barbershop/context");
      setContextValue(payload);
      return payload;
    } catch (error) {
      setContextValue(null);
      throw error;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authLoading) {
      return;
    }

    setLoading(true);
    refreshBarbershopContext().catch(() => null);
  }, [authLoading, isAuthenticated, session?.membership?.barbershopId]);

  const value = useMemo(
    () => ({
      loading,
      barbershop: contextValue?.barbershop || session?.barbershop || null,
      chatbotSettings: contextValue?.chatbotSettings || null,
      whatsappConnection: contextValue?.whatsappConnection || null,
      refreshBarbershopContext
    }),
    [contextValue, loading, session?.barbershop]
  );

  return (
    <BarbershopContext.Provider value={value}>
      {children}
    </BarbershopContext.Provider>
  );
}
