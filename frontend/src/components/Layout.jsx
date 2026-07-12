import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { 
  LayoutDashboard, 
  Upload, 
  Edit3, 
  Layers, 
  Users, 
  Settings, 
  Download,
  LogOut,
  ArrowRight,
  ArrowUp,
  Moon,
  Sun
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/importar", icon: Upload, label: "Importar" },
  { to: "/flujo/clasificar", icon: Edit3, label: "Editor" },
  { to: "/distribuir", icon: Layers, label: "Distribuir" },
  { to: "/exportar", icon: Download, label: "Exportar" },
  { to: "/usuarios", icon: Users, label: "Usuarios" },
  { to: "/configuracion", icon: Settings, label: "Configuración" },
];

const workflowSteps = [
  { key: "import", label: "Importar", path: "/importar", description: "Cargar comentarios", actionTestId: "import-button", actionLabel: "Importar" },
  { key: "classify", label: "Clasificar", path: "/flujo/clasificar", description: "Separar saludos y preguntas", actionTestId: "clasificar-ia-button", actionLabel: "Clasificar" },
  { key: "review_doubtful", label: "Revisar dudosas", path: "/flujo/dudosas", description: "Confirmar las que son pregunta", actionTestId: "filter-pill-dudoso", actionLabel: "Ver dudosas" },
  { key: "names", label: "Nombres", path: "/flujo/nombres", description: "Actualizar autores", actionTestId: "update-names-button", actionLabel: "Actualizar nombres" },
  { key: "confirm_names", label: "Confirmar nombres", path: "/flujo/confirmar-nombres", description: "Validar nombres derivados", actionTestId: "confirm-derived-names-button", actionLabel: "Confirmar nombres" },
  { key: "duplicates_fast", label: "Duplicados rápido", path: "/flujo/duplicados-rapido", description: "Buscar coincidencias exactas", actionTestId: "check-duplicates-button", actionLabel: "Duplicados rápido" },
  { key: "duplicates_ai", label: "Duplicados IA", path: "/flujo/duplicados-ia", description: "Buscar coincidencias semánticas", actionTestId: "check-duplicates-ai-button", actionLabel: "Buscar con IA" },
  { key: "review_duplicates", label: "Revisar duplicados", path: "/flujo/revisar-duplicados", description: "Aceptar o mantener", viewOnly: true, actionLabel: "Ver duplicados" },
  { key: "spelling", label: "Ortografía", path: "/flujo/ortografia", description: "Corregir preguntas finales", actionTestId: "correct-all-button", actionLabel: "Corregir" },
  { key: "reserve", label: "Reserva", path: "/flujo/reserva", description: "Incluir pendientes a mano", reserve: true, actionTestId: "open-reserve-button", actionLabel: "Ver reserva" },
  { key: "distribute", label: "Distribuir", path: "/distribuir", description: "Crear programas", actionTestId: "distribute-button", actionLabel: "Distribuir" },
  { key: "export", label: "Exportar", path: "/exportar", description: "Descargar TXT y PNG", actionTestId: "export-all-button", actionLabel: "Exportar" },
];

const WORKFLOW_STEP_KEY = "workflowStepIndex";
const THEME_STORAGE_KEY = "spmTheme";

const getWorkflowIndexFromPath = (pathname, currentIndex) => {
  if (pathname === "/") return 0;
  const index = workflowSteps.findIndex((step) => step.path === pathname);
  return index >= 0 ? index : currentIndex;
};

const getWorkflowStepStatus = (index, currentIndex) => {
  if (index < currentIndex) return { label: "Hecho", dot: "bg-green-500" };
  if (index === currentIndex) return { label: "Ahora", dot: "bg-primary" };
  return { label: "Pendiente", dot: "bg-slate-300" };
};

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(THEME_STORAGE_KEY) === "dark";
  });
  const [workflowIndex, setWorkflowIndex] = useState(() => {
    if (typeof window === "undefined") return 0;
    const stored = Number(sessionStorage.getItem(WORKFLOW_STEP_KEY));
    return Number.isInteger(stored) && stored >= 0 && stored < workflowSteps.length ? stored : 0;
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", isDarkMode);
    localStorage.setItem(THEME_STORAGE_KEY, isDarkMode ? "dark" : "light");
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      "content",
      isDarkMode ? "#202124" : "#171713"
    );
  }, [isDarkMode]);

  useEffect(() => {
    setWorkflowIndex((current) => {
      const next = getWorkflowIndexFromPath(location.pathname, current);
      sessionStorage.setItem(WORKFLOW_STEP_KEY, String(next));
      return next;
    });
  }, [location.pathname]);

  const goToWorkflowStep = (index) => {
    const boundedIndex = Math.max(0, Math.min(index, workflowSteps.length - 1));
    const step = workflowSteps[boundedIndex];
    sessionStorage.setItem(WORKFLOW_STEP_KEY, String(boundedIndex));
    setWorkflowIndex(boundedIndex);

    if (step.reserve) {
      sessionStorage.removeItem("selectedBatch");
      sessionStorage.setItem("editorGlobalReserve", "true");
      sessionStorage.setItem("editorAssignmentFilter", "reserve");
    } else if (step.path.startsWith("/flujo/")) {
      sessionStorage.removeItem("editorGlobalReserve");
      sessionStorage.removeItem("editorAssignmentFilter");
    }

    window.dispatchEvent(new CustomEvent("spm-workflow-step", {
      detail: { index: boundedIndex, key: step.key, path: step.path, reserve: step.reserve === true }
    }));
    navigate(step.path);
  };

  const runCurrentWorkflowStep = () => {
    if (location.pathname !== currentStep.path) {
      goToWorkflowStep(workflowIndex);
      return;
    }

    if (currentStep.viewOnly) {
      window.dispatchEvent(new CustomEvent("spm-workflow-step", {
        detail: { index: workflowIndex, key: currentStep.key, path: currentStep.path, reserve: currentStep.reserve === true }
      }));
      return;
    }

    if (!currentStep.actionTestId) {
      goToWorkflowStep(workflowIndex + 1);
      return;
    }

    const action = document.querySelector(`[data-testid="${currentStep.actionTestId}"]`);
    if (!action) {
      toast.error(`No se encontró la acción de ${currentStep.label}`);
      return;
    }

    if (action.disabled || action.getAttribute("aria-disabled") === "true") {
      toast.info(`No se puede ejecutar "${currentStep.label}" todavía`);
      return;
    }

    action.click();
  };

  const handleScrollToTop = () => {
    const main = document.querySelector(".app-main");
    if (main) {
      main.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleToggleTheme = () => {
    setIsDarkMode((current) => !current);
  };

  const currentStep = workflowSteps[workflowIndex];
  const isLastWorkflowStep = workflowIndex >= workflowSteps.length - 1;

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
            onClick={handleToggleTheme}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-sm text-xs uppercase tracking-wide font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            data-testid="theme-toggle-button"
          >
            {isDarkMode ? (
              <Sun className="w-4 h-4" strokeWidth={1.5} />
            ) : (
              <Moon className="w-4 h-4" strokeWidth={1.5} />
            )}
            {isDarkMode ? "Modo claro" : "Modo oscuro"}
          </button>
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

      <main className="app-main flex-1 overflow-auto pt-16 pb-24 md:pt-0 md:pb-0">
        <div className="sticky top-0 z-30 border-b border-border bg-background/95 px-4 py-3 backdrop-blur md:px-8">
          <div className="flex items-center gap-2">
              <div className="workflow-step-strip flex min-w-0 flex-1 overflow-x-auto">
                {workflowSteps.map((step, index) => {
                  const status = getWorkflowStepStatus(index, workflowIndex);
                  return (
                    <button
                      key={`${step.label}-${index}`}
                      type="button"
                      onClick={() => goToWorkflowStep(index)}
                      className={cn(
                        "mr-1 h-9 min-w-max rounded-sm border px-2.5 text-left text-[11px] font-medium transition-colors",
                        index === workflowIndex
                          ? "border-primary bg-primary text-primary-foreground"
                          : index < workflowIndex
                            ? "border-green-300 bg-green-50 text-green-700 hover:bg-green-100"
                            : "border-border bg-card text-muted-foreground hover:bg-secondary"
                      )}
                      title={`${index + 1}. ${step.label}: ${step.description} (${status.label})`}
                      data-testid={`workflow-step-${index + 1}`}
                    >
                      <span className="flex items-center gap-1.5 leading-none">
                        <span className={cn("h-2 w-2 rounded-full", index === workflowIndex ? "bg-primary-foreground" : status.dot)} />
                        <span>{index + 1}. {step.label}</span>
                      </span>
                      <span className={cn(
                        "mt-0.5 hidden text-[9px] uppercase tracking-wide sm:block",
                        index === workflowIndex ? "text-primary-foreground/80" : "text-muted-foreground"
                      )}>
                        {status.label}
                      </span>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={runCurrentWorkflowStep}
                className={cn(
                  "flex h-8 shrink-0 items-center gap-1 rounded-sm px-3 text-xs font-semibold uppercase tracking-wide transition-colors",
                  isLastWorkflowStep
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-primary text-primary-foreground hover:bg-primary/90"
                )}
                data-testid="workflow-next-button"
              >
                {currentStep.actionLabel || "Siguiente"}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => goToWorkflowStep(workflowIndex + 1)}
                disabled={isLastWorkflowStep}
                className={cn(
                  "hidden h-8 shrink-0 rounded-sm border px-3 text-xs font-semibold uppercase tracking-wide transition-colors sm:inline-flex sm:items-center",
                  isLastWorkflowStep
                    ? "cursor-not-allowed border-border bg-secondary text-muted-foreground"
                    : "border-border bg-card text-foreground hover:bg-secondary"
                )}
                data-testid="workflow-skip-button"
              >
                Paso siguiente
              </button>
          </div>
        </div>
        <Outlet />
        <div className="px-4 pb-8 pt-2 md:px-8 md:pb-10">
          <button
            type="button"
            onClick={handleScrollToTop}
            className="mx-auto flex items-center gap-2 rounded-sm border border-border bg-card px-4 py-2 text-xs font-semibold uppercase tracking-wide text-foreground transition-colors hover:bg-secondary"
            title="Volver al inicio de la página"
            aria-label="Volver al inicio de la página"
            data-testid="page-scroll-to-top-button"
          >
            <ArrowUp className="h-4 w-4" />
            Volver al inicio
          </button>
        </div>
      </main>

      <button
        type="button"
        onClick={handleToggleTheme}
        className="fixed bottom-20 left-4 z-50 flex h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-xs font-semibold uppercase tracking-wide text-foreground shadow-lg transition-colors hover:bg-secondary md:bottom-4 md:left-[17rem]"
        title={isDarkMode ? "Activar modo claro" : "Activar modo oscuro"}
        aria-label={isDarkMode ? "Activar modo claro" : "Activar modo oscuro"}
        data-testid="floating-theme-toggle-button"
      >
        {isDarkMode ? (
          <Sun className="h-4 w-4" />
        ) : (
          <Moon className="h-4 w-4" />
        )}
        {isDarkMode ? "Modo claro" : "Modo oscuro"}
      </button>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border pb-[env(safe-area-inset-bottom)]">
        <div className="mobile-bottom-nav flex overflow-x-auto overscroll-x-contain">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                cn(
                  "h-16 min-w-[76px] flex-1 flex flex-col items-center justify-center gap-1 px-1 text-[10px] font-medium transition-colors",
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
