import { useContext } from "react";
import { BarbershopContext } from "../context/BarbershopContext.jsx";

export function useBarbershop() {
  const context = useContext(BarbershopContext);

  if (!context) {
    throw new Error("useBarbershop precisa ser usado dentro de BarbershopProvider.");
  }

  return context;
}
