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
  Database,
  Download,
  Upload,
  HardDrive,
  CheckCircle,
  LogOut,
  Link2,
  Ban
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
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [selectedCleanupDays, setSelectedCleanupDays] = useState("30");
  const [youtubeAuth, setYoutubeAuth] = useState({ authenticated: false, loading: true });
  const [connecting, setConnecting] = useState(false);
  const [blockedComments, setBlockedComments] = useState([]);
  const [blockedLoading, setBlockedLoading] = useState(false);

  useEffect(() => {
    fetchSettings();
    fetchCleanupStats();
    checkYoutubeAuth();
    fetchBlockedComments();

    // Listen for popup messages
    const handleMessage = (event) => {
      if (event.data?.type === 'youtube-auth-success') {
        toast.success("Cuenta de YouTube conectada");
        checkYoutubeAuth();
        setConnecting(false);
      } else if (event.data?.type === 'youtube-auth-error') {
        toast.error("Error al conectar: " + (event.data.error || ""));
        setConnecting(false);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const checkYoutubeAuth = async () => {
    try {
      const response = await axios.get(`${API}/youtube/auth-status`);
      setYoutubeAuth({ ...response.data, loading: false });
    } catch (error) {
      console.error("Error checking YouTube auth:", error);
      setYoutubeAuth({ authenticated: false, loading: false });
    }
  };

  const handleConnectYouTube = async () => {
    setConnecting(true);
    try {
      const redirectUri = `${window.location.origin}/youtube-callback.html`;
      const response = await axios.get(`${API}/youtube/auth-url`, {
        params: { redirect_uri: redirectUri }
      });

      const width = 500;
      const height = 650;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;

      const popup = window.open(
        response.data.auth_url,
        'youtube_auth',
        `width=${width},height=${height},left=${left},top=${top}`
      );

      if (!popup) {
        toast.error("El navegador bloqueó la ventana emergente. Habilita los popups.");
        setConnecting(false);
        return;
      }

      // Poll for popup closure
      const timer = setInterval(() => {
        if (popup.closed) {
          clearInterval(timer);
          setConnecting(false);
          checkYoutubeAuth();
        }
      }, 500);
    } catch (error) {
      console.error("Error getting auth URL:", error);
      toast.error(error.response?.data?.detail || "Error al iniciar conexión con YouTube");
      setConnecting(false);
    }
  };

  const handleDisconnectYouTube = async () => {
    try {
      await axios.delete(`${API}/youtube/disconnect`);
      setYoutubeAuth({ authenticated: false, loading: false });
      toast.success("Cuenta de YouTube desconectada");
    } catch (error) {
      toast.error("Error al desconectar");
    }
  };

  const fetchBlockedComments = async () => {
    setBlockedLoading(true);
    try {
      const res = await axios.get(`${API}/comentarios-bloqueados`);
      setBlockedComments(res.data);
    } catch (error) {
      console.error("Error fetching blocked list:", error);
    } finally {
      setBlockedLoading(false);
    }
  };

  const handleUnblock = async (id) => {
    if (!window.confirm("¿Eliminar esta entrada de la lista negra?")) return;
    try {
      await axios.delete(`${API}/comentarios-bloqueados/${id}`);
      setBlockedComments(prev => prev.filter(b => b.id !== id));
      toast.success("Entrada eliminada");
    } catch (error) {
      toast.error("Error al eliminar entrada");
    }
  };

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

  const handleBackup = async () => {
    setBackingUp(true);
    try {
      const response = await axios.get(`${API}/backup`);
      const dataStr = JSON.stringify(response.data, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `backup_${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(`Backup descargado: ${response.data.counts.questions} preguntas, ${response.data.counts.batches} lotes`);
    } catch (error) {
      console.error("Error creating backup:", error);
      toast.error("Error al crear backup");
    } finally {
      setBackingUp(false);
    }
  };

  const handleRestore = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setRestoring(true);
    try {
      const text = await file.text();
      const backupData = JSON.parse(text);
      
      if (!backupData.data) {
        toast.error("Formato de backup inválido");
        return;
      }
      
      const response = await axios.post(`${API}/restore`, backupData);
      toast.success(`Restaurado: ${Object.entries(response.data.restored).map(([k,v]) => `${v} ${k}`).join(', ')}`);
      fetchCleanupStats();
    } catch (error) {
      console.error("Error restoring backup:", error);
      toast.error("Error al restaurar backup: " + (error.response?.data?.detail || error.message));
    } finally {
      setRestoring(false);
      event.target.value = '';
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

        {/* YouTube Account Connection */}
        <Card className="bg-card border border-border rounded-sm lg:col-span-2">
          <CardHeader>
            <CardTitle className="font-heading text-lg uppercase tracking-tight flex items-center gap-2">
              <Link2 className="w-5 h-5 text-primary" />
              CUENTA DE YOUTUBE
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Conecta la cuenta de YouTube (Google) que quieres usar para descargar comentarios. 
              Se abrirá una ventana emergente para que puedas elegir cualquier cuenta de Google, 
              independientemente de la sesión activa en tu navegador.
            </p>

            {youtubeAuth.loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : youtubeAuth.authenticated ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between p-4 bg-green-500/10 border border-green-500/30 rounded-sm gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">Cuenta conectada</p>
                      {youtubeAuth.account_email && (
                        <p className="text-sm text-muted-foreground truncate" data-testid="youtube-account-email">
                          {youtubeAuth.account_email}
                        </p>
                      )}
                      {youtubeAuth.channel_title && (
                        <p className="text-xs text-muted-foreground truncate">
                          Canal: {youtubeAuth.channel_title}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="outline"
                    onClick={handleConnectYouTube}
                    disabled={connecting}
                    className="rounded-sm uppercase tracking-wide text-xs"
                    data-testid="change-youtube-account-button"
                  >
                    {connecting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Conectando...
                      </>
                    ) : (
                      <>
                        <Youtube className="w-4 h-4 mr-2" />
                        Cambiar de cuenta
                      </>
                    )}
                  </Button>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        className="rounded-sm uppercase tracking-wide text-xs border-destructive/50 text-destructive hover:bg-destructive/10"
                        data-testid="disconnect-youtube-button"
                      >
                        <LogOut className="w-4 h-4 mr-2" />
                        Desconectar
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>¿Desconectar cuenta de YouTube?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Se eliminará el token guardado. Tendrás que volver a conectarte 
                          para descargar comentarios desde el Importador.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleDisconnectYouTube}
                          className="bg-destructive hover:bg-destructive/90"
                        >
                          Desconectar
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ) : (
              <div>
                <Button
                  onClick={handleConnectYouTube}
                  disabled={connecting || !settings.youtube_client_id || !settings.youtube_client_secret}
                  className="bg-red-600 hover:bg-red-700 rounded-sm uppercase tracking-wide"
                  data-testid="connect-youtube-account-button"
                >
                  {connecting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Conectando...
                    </>
                  ) : (
                    <>
                      <Youtube className="w-4 h-4 mr-2" />
                      Conectar cuenta de YouTube
                    </>
                  )}
                </Button>
                {(!settings.youtube_client_id || !settings.youtube_client_secret) && (
                  <p className="text-xs text-yellow-600 mt-3 flex items-center gap-2">
                    <AlertTriangle className="w-3 h-3" />
                    Primero configura el Client ID y Client Secret arriba, guarda y después conecta la cuenta.
                  </p>
                )}
              </div>
            )}
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

        {/* Blocked Comments Section */}
        <Card className="bg-card border border-border rounded-sm lg:col-span-2">
          <CardHeader>
            <CardTitle className="font-heading text-lg uppercase tracking-tight flex items-center gap-2">
              <Ban className="w-5 h-5 text-orange-500" />
              COMENTARIOS BLOQUEADOS
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Comentarios recurrentes que se eliminan automáticamente durante la importación o clasificación.
              La coincidencia requiere el mismo usuario y ≥80% de similitud en el texto.
            </p>

            {blockedLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : blockedComments.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">La lista está vacía.</p>
            ) : (
              <div className="space-y-2" data-testid="blocked-list">
                {blockedComments.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-start justify-between gap-4 p-3 bg-secondary/30 border border-border rounded-sm"
                    data-testid={`blocked-entry-${b.id}`}
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-medium">{b.youtube_username}</span>
                        {b.motivo && (
                          <span className="text-xs text-muted-foreground">· {b.motivo}</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground italic line-clamp-2">
                        "{b.texto_referencia.length > 180
                          ? b.texto_referencia.slice(0, 180) + '…'
                          : b.texto_referencia}"
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleUnblock(b.id)}
                      className="rounded-sm text-xs text-destructive hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
                      data-testid={`unblock-btn-${b.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Backup Section */}
        <Card className="bg-card border border-primary/30 rounded-sm lg:col-span-2">
          <CardHeader>
            <CardTitle className="font-heading text-lg uppercase tracking-tight flex items-center gap-2 text-primary">
              <HardDrive className="w-5 h-5" />
              BACKUP Y RESTAURACIÓN
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-sm text-muted-foreground">
              Descarga una copia de seguridad de todos tus datos o restaura desde un backup anterior.
            </p>
            
            <div className="flex flex-wrap gap-4">
              <Button
                onClick={handleBackup}
                disabled={backingUp}
                className="rounded-sm uppercase tracking-wide"
                data-testid="backup-button"
              >
                {backingUp ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creando backup...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Descargar Backup
                  </>
                )}
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    disabled={restoring}
                    className="rounded-sm uppercase tracking-wide"
                    data-testid="restore-button"
                  >
                    {restoring ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Restaurando...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 mr-2" />
                        Restaurar Backup
                      </>
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>⚠️ Restaurar Backup</AlertDialogTitle>
                    <AlertDialogDescription>
                      Al restaurar un backup, <strong>TODOS los datos actuales serán reemplazados</strong>.
                      <br /><br />
                      Asegúrate de haber descargado un backup de los datos actuales antes de continuar.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction asChild>
                      <label className="cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-sm">
                        Seleccionar archivo
                        <input
                          type="file"
                          accept=".json"
                          onChange={handleRestore}
                          className="hidden"
                        />
                      </label>
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            <p className="text-xs text-muted-foreground">
              El backup incluye: preguntas, lotes, programas, usuarios y configuración.
            </p>
          </CardContent>
        </Card>

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
                Nota: Los usuarios registrados (@username → nombre real) <strong>nunca se eliminan</strong>. Se conservan para futuras importaciones.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
