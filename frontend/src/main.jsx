import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { BarbershopProvider } from "./context/BarbershopContext.jsx";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import { registerServiceWorker } from "./registerServiceWorker.js";
import "./styles.css";

registerServiceWorker();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <BarbershopProvider>
            <App />
          </BarbershopProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);
