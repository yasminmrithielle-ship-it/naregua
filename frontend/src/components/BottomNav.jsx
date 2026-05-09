import { NavLink } from "react-router-dom";
import { navigationLinks } from "./Sidebar.jsx";

const mobileLinks = navigationLinks().filter((item) =>
  ["/app/dashboard", "/app/agenda", "/app/clientes", "/app/chatbot", "/app/configuracoes"].includes(
    item.to
  )
);

export default function BottomNav() {
  return (
    <nav className="fixed inset-x-3 bottom-3 z-40 lg:hidden">
      <div className="panel-card mx-auto grid max-w-2xl grid-cols-5 gap-2 p-2">
        {mobileLinks.map((link) => (
          <NavLink
            key={link.to}
            className={({ isActive }) =>
              `rounded-2xl px-2 py-3 text-center text-[11px] font-medium transition ${
                isActive
                  ? "bg-[rgba(212,166,74,0.16)] text-[var(--accent-strong)]"
                  : "text-[var(--muted)]"
              }`
            }
            to={link.to}
          >
            {link.shortLabel}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
