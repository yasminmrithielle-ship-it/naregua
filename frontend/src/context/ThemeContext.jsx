import { createContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "barbergo-theme";

export const ThemeContext = createContext(null);

function getStoredTheme() {
  const theme = localStorage.getItem(STORAGE_KEY);
  return theme === "dark" ? "dark" : "light";
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getStoredTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const value = useMemo(
    () => ({
      theme,
      toggleTheme() {
        setTheme((current) => (current === "dark" ? "light" : "dark"));
      }
    }),
    [theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
