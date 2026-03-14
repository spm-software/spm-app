import { NavLink, Outlet } from "react-router-dom";
import { 
  LayoutDashboard, 
  Upload, 
  Edit3, 
  Layers, 
  Users, 
  Settings, 
  Download
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/importar", icon: Upload, label: "Importar" },
  { to: "/editor", icon: Edit3, label: "Editor" },
  { to: "/distribuir", icon: Layers, label: "Distribuir" },
  { to: "/usuarios", icon: Users, label: "Usuarios" },
  { to: "/exportar", icon: Download, label: "Exportar" },
  { to: "/configuracion", icon: Settings, label: "Configuración" },
];

export default function Layout() {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-64 bg-card border-r border-border flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <img 
              src="https://customer-assets.emergentagent.com/job_youtube-qna-manager/artifacts/369twhb0_Logo%20SPM.jpg" 
              alt="Samuel Pérez Millos"
              className="w-12 h-12 rounded-full object-cover"
            />
            <div>
              <h1 className="font-heading text-base font-bold tracking-tight leading-tight">
                GESTOR Q&A
              </h1>
              <p className="text-xs text-muted-foreground">
                Samuel Pérez Millos
              </p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-4 py-3 rounded-sm text-sm font-medium transition-colors",
                  "hover:bg-secondary",
                  isActive 
                    ? "bg-primary text-primary-foreground hover:bg-primary/90" 
                    : "text-foreground"
                )
              }
            >
              <item.icon className="w-5 h-5" strokeWidth={1.5} />
              <span className="uppercase tracking-wide text-xs">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-border">
          <p className="text-xs text-muted-foreground text-center">
            Gestión quincenal de preguntas
          </p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
