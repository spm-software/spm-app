import { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { 
  Settings, 
  Save, 
  Loader2,
  Cpu,
  Youtube,
  Hash,
  Trash2,
  AlertTriangle,
  Database
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function Configuracion() {
  const [settings, setSettings] = useState({
    num_programs: 4,
    max_questions_per_user_per_program: 2,
    llm_provider: "openai",
    youtube_client_id: "",
    youtube_client_secret: ""
  });
  const [cleanupStats, setCleanupStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [selectedCleanupDays, setSelectedCleanupDays] = useState("30");

  useEffect(() => {
    fetchSettings();
    fetchCleanupStats();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await axios.get(`${API}/settings`);
      setSettings(response.data);
    } catch (error) {
      console.error("Error fetching settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCleanupStats = async () => {
    try {
      const response = await axios.get(`${API}/cleanup/stats`);
      setCleanupStats(response.data);
    } catch (error) {
      console.error("Error fetching cleanup stats:", error);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/settings`, settings);
      toast.success("Configuración guardada");
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error("Error al guardar configuración");
    } finally {
      setSaving(false);
    }
  };

  const handleCleanupQuestions = async () => {
    setCleaning(true);
    try {
      const response = await axios.delete(`${API}/cleanup/questions?days=${selectedCleanupDays}`);
      toast.success(`Eliminadas ${response.data.deleted_questions} preguntas y ${response.data.deleted_programs} programas`);
      fetchCleanupStats();
    } catch (error) {
      console.error("Error cleaning up:", error);
      toast.error("Error al limpiar datos");
    } finally {
      setCleaning(false);
    }
  };

  const handleCleanupBatches = async () => {
    setCleaning(true);
    try {
      const response = await axios.delete(`${API}/cleanup/batches?days=${selectedCleanupDays}`);
      toast.success(`Eliminados ${response.data.deleted_batches} lotes, ${response.data.deleted_questions} preguntas y ${response.data.deleted_programs} programas`);
      fetchCleanupStats();
    } catch (error) {
      console.error("Error cleaning up:", error);
      toast.error("Error al limpiar datos");
    } finally {
      setCleaning(false);
    }
  };

  const handleCleanupAll = async () => {
    setCleaning(true);
    try {
      const response = await axios.delete(`${API}/cleanup/all`);
      toast.success(`Eliminados: ${response.data.deleted_questions} preguntas, ${response.data.deleted_batches} lotes, ${response.data.deleted_programs} programas`);
      fetchCleanupStats();
    } catch (error) {
      console.error("Error cleaning up:", error);
      toast.error("Error al limpiar datos");
    } finally {
      setCleaning(false);
    }
  };

  const cleanupPeriods = [
    { value: "7", label: "7 días", key: "7_days" },
    { value: "15", label: "15 días", key: "15_days" },
    { value: "30", label: "30 días (1 mes)", key: "30_days" },
    { value: "60", label: "60 días (2 meses)", key: "60_days" },
    { value: "90", label: "90 días (3 meses)", key: "90_days" },
  ];

  const getStatsForPeriod = (key) => {
    if (!cleanupStats || !cleanupStats[key]) return { questions: 0, batches: 0 };
    return cleanupStats[key];
  };

  if (loading) {
    return (
      <div className="p-8 md:p-12">
        <div className="animate-pulse space-y-8">
          <div className="h-10 w-64 bg-muted rounded" />
          <div className="h-64 bg-muted rounded-sm" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 md:p-12 animate-fade-in">
      {/* Header */}
      <div className="mb-12">
        <h1 className="font-heading text-4xl sm:text-5xl font-bold tracking-tight mb-2">
          CONFIGURACIÓN
        </h1>
        <p className="text-muted-foreground">
          Ajusta los parámetros del gestor de preguntas
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-5xl">
        {/* Distribution Settings */}
        <Card className="bg-card border border-border rounded-sm">
          <CardHeader>
            <CardTitle className="font-heading text-lg uppercase tracking-tight flex items-center gap-2">
              <Hash className="w-5 h-5 text-primary" />
              DISTRIBUCIÓN
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Número de programas por defecto
              </Label>
              <Select 
                value={settings.num_programs.toString()} 
                onValueChange={(v) => setSettings({...settings, num_programs: parseInt(v)})}
              >
                <SelectTrigger className="mt-2 rounded-sm" data-testid="default-programs-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 programas</SelectItem>
                  <SelectItem value="4">4 programas</SelectItem>
                  <SelectItem value="5">5 programas</SelectItem>
                  <SelectItem value="6">6 programas</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Máximo preguntas por usuario por programa
              </Label>
              <Select 
                value={settings.max_questions_per_user_per_program.toString()} 
                onValueChange={(v) => setSettings({...settings, max_questions_per_user_per_program: parseInt(v)})}
              >
                <SelectTrigger className="mt-2 rounded-sm" data-testid="max-questions-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 pregunta</SelectItem>
                  <SelectItem value="2">2 preguntas</SelectItem>
                  <SelectItem value="3">3 preguntas</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-2">
                Si un usuario tiene más preguntas, el exceso irá a Reserva
              </p>
            </div>
          </CardContent>
        </Card>

        {/* AI Settings */}
        <Card className="bg-card border border-border rounded-sm">
          <CardHeader>
            <CardTitle className="font-heading text-lg uppercase tracking-tight flex items-center gap-2">
              <Cpu className="w-5 h-5 text-primary" />
              CORRECCIÓN IA
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Proveedor de IA
              </Label>
              <Select 
                value={settings.llm_provider} 
                onValueChange={(v) => setSettings({...settings, llm_provider: v})}
              >
                <SelectTrigger className="mt-2 rounded-sm" data-testid="llm-provider-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI GPT-5.2</SelectItem>
                  <SelectItem value="anthropic">Claude Sonnet 4.5</SelectItem>
                  <SelectItem value="gemini">Gemini 3 Flash</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-2">
                Usando Emergent LLM Key universal
              </p>
            </div>
          </CardContent>
        </Card>

        {/* YouTube API Settings */}
        <Card className="bg-card border border-border rounded-sm lg:col-span-2">
          <CardHeader>
            <CardTitle className="font-heading text-lg uppercase tracking-tight flex items-center gap-2">
              <Youtube className="w-5 h-5 text-primary" />
              YOUTUBE API (OPCIONAL)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-sm text-muted-foreground">
              Configura las credenciales para acceder a comentarios directamente desde YouTube (función futura).
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Client ID
                </Label>
                <Input
                  value={settings.youtube_client_id || ""}
                  onChange={(e) => setSettings({...settings, youtube_client_id: e.target.value})}
                  placeholder="Tu Client ID de OAuth"
                  className="mt-2 rounded-sm font-mono text-sm"
                  data-testid="youtube-client-id-input"
                />
              </div>
              <div>
                <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Client Secret
                </Label>
                <Input
                  type="password"
                  value={settings.youtube_client_secret || ""}
                  onChange={(e) => setSettings({...settings, youtube_client_secret: e.target.value})}
                  placeholder="Tu Client Secret"
                  className="mt-2 rounded-sm font-mono text-sm"
                  data-testid="youtube-client-secret-input"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="lg:col-span-2">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="rounded-sm uppercase tracking-wide"
            data-testid="save-settings-button"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Guardar configuración
              </>
            )}
          </Button>
        </div>

        {/* Database Cleanup Section */}
        <Card className="bg-card border border-destructive/30 rounded-sm lg:col-span-2">
          <CardHeader>
            <CardTitle className="font-heading text-lg uppercase tracking-tight flex items-center gap-2 text-destructive">
              <Database className="w-5 h-5" />
              LIMPIEZA DE BASE DE DATOS
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Stats Summary */}
            {cleanupStats && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-secondary/30 rounded-sm">
                <div>
                  <p className="text-2xl font-bold">{cleanupStats.total_questions || 0}</p>
                  <p className="text-xs text-muted-foreground uppercase">Preguntas totales</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{cleanupStats.total_batches || 0}</p>
                  <p className="text-xs text-muted-foreground uppercase">Lotes totales</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{cleanupStats.total_programs || 0}</p>
                  <p className="text-xs text-muted-foreground uppercase">Programas</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{cleanupStats.total_users || 0}</p>
                  <p className="text-xs text-muted-foreground uppercase">Usuarios</p>
                </div>
              </div>
            )}

            {/* Cleanup by Age */}
            <div className="space-y-4">
              <div>
                <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Eliminar datos más antiguos de:
                </Label>
                <Select value={selectedCleanupDays} onValueChange={setSelectedCleanupDays}>
                  <SelectTrigger className="mt-2 w-64 rounded-sm" data-testid="cleanup-days-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {cleanupPeriods.map((period) => {
                      const stats = getStatsForPeriod(period.key);
                      return (
                        <SelectItem key={period.value} value={period.value}>
                          {period.label} ({stats.questions} preguntas, {stats.batches} lotes)
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* Preview of what will be deleted */}
              {cleanupStats && (
                <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-sm">
                  <p className="text-sm font-medium mb-2 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-destructive" />
                    Se eliminarán datos anteriores a {selectedCleanupDays} días:
                  </p>
                  <p className="text-sm text-muted-foreground">
                    • {getStatsForPeriod(`${selectedCleanupDays}_days`).questions} preguntas
                    <br />
                    • {getStatsForPeriod(`${selectedCleanupDays}_days`).batches} lotes (y sus programas asociados)
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-3 pt-2">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      disabled={cleaning}
                      className="rounded-sm uppercase tracking-wide text-xs border-destructive/50 text-destructive hover:bg-destructive/10"
                      data-testid="cleanup-questions-button"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Eliminar preguntas antiguas
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>¿Eliminar preguntas antiguas?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Se eliminarán todas las preguntas con más de {selectedCleanupDays} días de antigüedad.
                        Esta acción no se puede deshacer.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={handleCleanupQuestions} className="bg-destructive hover:bg-destructive/90">
                        Eliminar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      disabled={cleaning}
                      className="rounded-sm uppercase tracking-wide text-xs border-destructive/50 text-destructive hover:bg-destructive/10"
                      data-testid="cleanup-batches-button"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Eliminar lotes antiguos
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>¿Eliminar lotes antiguos?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Se eliminarán todos los lotes con más de {selectedCleanupDays} días, 
                        incluyendo sus preguntas y programas asociados.
                        Esta acción no se puede deshacer.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={handleCleanupBatches} className="bg-destructive hover:bg-destructive/90">
                        Eliminar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="destructive"
                      disabled={cleaning}
                      className="rounded-sm uppercase tracking-wide text-xs"
                      data-testid="cleanup-all-button"
                    >
                      <AlertTriangle className="w-4 h-4 mr-2" />
                      Eliminar TODO
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-destructive">⚠️ ¿Eliminar TODOS los datos?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Se eliminarán TODAS las preguntas, lotes y programas de la base de datos.
                        <br /><br />
                        <strong>Los usuarios registrados se conservarán</strong> para futuras importaciones.
                        <br /><br />
                        Esta acción es IRREVERSIBLE.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={handleCleanupAll} className="bg-destructive hover:bg-destructive/90">
                        Sí, eliminar todo
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                {cleaning && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Eliminando...
                  </div>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                Nota: Los usuarios registrados (mapeo @username → nombre real) nunca se eliminan automáticamente.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
