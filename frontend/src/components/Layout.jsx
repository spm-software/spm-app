import { NavLink, Outlet } from "react-router-dom";
import { 
  LayoutDashboard, 
  Upload, 
  Edit3, 
  Layers, 
  Users, 
  Settings, 
  Download,
  Youtube
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
            <div className="w-10 h-10 rounded-sm bg-primary flex items-center justify-center">
              <Youtube className="w-6 h-6 text-primary-foreground" strokeWidth={1.5} />
            </div>
            <div>
              <h1 className="font-heading text-lg font-bold tracking-tight">
                GESTOR Q&A
              </h1>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">
                YouTube
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
