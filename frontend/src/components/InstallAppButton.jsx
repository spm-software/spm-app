import { useEffect, useState } from "react";
import { Download, Share, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const isStandalone = () => (
  window.matchMedia("(display-mode: standalone)").matches
  || window.navigator.standalone === true
);

const isMobileDevice = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

export default function InstallAppButton({ compact = false }) {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installed, setInstalled] = useState(() => isStandalone());
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    const handlePrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    const handleInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", handlePrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handlePrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  if (installed || (!installPrompt && !isMobileDevice())) return null;

  const install = async () => {
    if (!installPrompt) {
      setHelpOpen(true);
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setInstallPrompt(null);
  };

  return (
    <>
      <button
        type="button"
        onClick={install}
        className={cn(
          "rounded-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
          compact
            ? "flex h-10 w-10 items-center justify-center"
            : "flex w-full items-center gap-3 px-4 py-2.5 text-xs uppercase tracking-wide"
        )}
        title="Instalar la aplicación"
        aria-label="Instalar la aplicación"
      >
        <Download className={compact ? "h-5 w-5" : "h-4 w-4"} strokeWidth={1.5} />
        {!compact && "Instalar app"}
      </button>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-sm rounded-sm">
          <DialogHeader>
            <div className="mb-2 flex h-12 w-12 items-center justify-center bg-primary/10 text-primary">
              <Smartphone className="h-6 w-6" />
            </div>
            <DialogTitle>Instalar Gestor SPM</DialogTitle>
            <DialogDescription className="space-y-3 pt-2 text-left">
              <span className="block">Abre esta página en Safari y pulsa el botón Compartir.</span>
              <span className="flex items-center gap-2 font-medium text-foreground"><Share className="h-4 w-4" />Selecciona “Añadir a pantalla de inicio”.</span>
              <span className="block">El acceso aparecerá con el logo de Samuel Pérez Millos y se abrirá como una aplicación.</span>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </>
  );
}
