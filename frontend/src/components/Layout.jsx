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
      <aside className="hidden md:flex w-64 bg-card border-r border-border flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <img
              src="/icons/icon.svg"
              alt="Samuel Pérez Millos Asociación Teológica"
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
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-card border-b border-border">
        <div className="h-16 px-4 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/icons/icon.svg"
              alt="Samuel Pérez Millos Asociación Teológica"
              className="w-10 h-10 rounded-full object-cover flex-shrink-0"
            />
            <div className="min-w-0">
              <h1 className="font-heading text-sm font-bold tracking-tight leading-tight truncate">
                GESTOR Q&A
              </h1>
              <p className="text-[11px] text-muted-foreground truncate">
                {user?.name || user?.email || "Samuel Pérez Millos"}
              </p>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-10 h-10 rounded-sm flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
            aria-label="Cerrar sesión"
            data-testid="mobile-logout-button"
          >
            <LogOut className="w-5 h-5" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      <main className="app-main flex-1 overflow-auto pt-16 pb-20 md:pt-0 md:pb-0">
        <Outlet />
      </main>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-7">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                cn(
                  "h-16 flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors",
                  isActive
                    ? "text-primary bg-primary/5"
                    : "text-muted-foreground hover:text-foreground"
                )
              }
            >
              <item.icon className="w-5 h-5" strokeWidth={1.5} />
              <span className="leading-none truncate max-w-full px-0.5">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
