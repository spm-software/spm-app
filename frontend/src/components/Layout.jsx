import { NavLink, Outlet } from "react-router-dom";
import { 
  LayoutDashboard, 
  Upload, 
  Edit3, 
  Layers, 
  Users, 
  Settings, 
  Download,
  LogOut
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

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
  const { user, logout } = useAuth();
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

        {/* Footer with user + logout */}
        <div className="p-4 border-t border-border space-y-3">
          {user && (
            <div className="flex items-center gap-2 px-2" data-testid="current-user">
              {user.picture ? (
                <img src={user.picture} alt="" className="w-7 h-7 rounded-full" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-bold">
                  {(user.name || user.email || "?").slice(0, 1).toUpperCase()}
                </div>
              )}
              <span className="text-xs text-muted-foreground truncate flex-1">
                {user.name || user.email}
              </span>
            </div>
          )}
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-sm text-xs uppercase tracking-wide font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
            data-testid="logout-button"
          >
            <LogOut className="w-4 h-4" strokeWidth={1.5} />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
