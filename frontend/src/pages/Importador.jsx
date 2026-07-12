import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Upload, 
  CheckCircle, 
  Loader2, 
  CirclePlay as Youtube,
  Link2,
  Download,
  History
} from "lucide-react";
import { API_BASE_URL as API } from "@/lib/api";

export default function Importador() {
  // Manual import state
  const [rawText, setRawText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  
  // YouTube import state
  const [youtubeAuth, setYoutubeAuth] = useState({ authenticated: false, loading: true });
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [manualCutoffText, setManualCutoffText] = useState("");
  const [fetchingComments, setFetchingComments] = useState(false);
  const [fetchProgress, setFetchProgress] = useState(0);
  const [youtubeResult, setYoutubeResult] = useState(null);
  const [lastAnchor, setLastAnchor] = useState(null);

  // Check YouTube auth status on mount
  useEffect(() => {
    checkYoutubeAuth();
  }, []);

  const checkYoutubeAuth = async () => {
    try {
      const response = await axios.get(`${API}/youtube/auth-status`);
      setYoutubeAuth({ 
        ...response.data, 
        loading: false 
      });
      setLastAnchor(response.data.last_anchor || null);
      
      // The anchor is purely informational now — never auto-cutoff.
      // Manual textarea is always visible (empty by default = no cutoff, full range).
      setManualCutoffText("");
      
      // Set default dates
      const today = new Date();
      const twoWeeksAgo = new Date(today);
      twoWeeksAgo.setDate(today.getDate() - 15);
      
      setFechaHasta(today.toISOString().split('T')[0]);
      setFechaDesde(twoWeeksAgo.toISOString().split('T')[0]);
      
    } catch (error) {
      console.error("Error checking YouTube auth:", error);
      setYoutubeAuth({ authenticated: false, loading: false });
    }
  };

  const handleFetchYouTubeComments = async () => {
    if (!fechaDesde || !fechaHasta) {
      toast.error("Selecciona el rango de fechas");
      return;
    }
    
    setFetchingComments(true);
    setFetchProgress(10);
    setYoutubeResult(null);
    
    try {
      setFetchProgress(30);
      
      // Determine cutoff to send: only `texto_corte` is honored.
      // Date range ALWAYS prevails — anchor is never used as automatic cutoff.
      const manualText = manualCutoffText.trim();
      const payload = {
        fecha_desde: fechaDesde,
        fecha_hasta: fechaHasta
      };
      if (manualText) payload.texto_corte = manualText;
      
      const response = await axios.post(`${API}/youtube/fetch-comments`, payload);
      
      setFetchProgress(70);
      
      if (response.data.comments_count === 0) {
        toast.info("No se encontraron comentarios en ese período");
        setYoutubeResult(response.data);
        setFetchProgress(100);
        return;
      }
      
      // Now import the comments directly (dedup by youtube_comment_id in backend)
      setFetchProgress(85);
      
      const importResponse = await axios.post(`${API}/youtube/import-comments`, {
        comments: response.data.comments
      });
      
      setFetchProgress(100);
      
      setYoutubeResult({
        ...response.data,
        imported: importResponse.data
      });
      setLastAnchor(importResponse.data.last_anchor || null);
      
      // Refresh auth/anchor info so the aviso shows the new last comment
      await checkYoutubeAuth();
      
      const n = importResponse.data.questions_imported || 0;
      const u = importResponse.data.questions_updated || 0;
      if (n > 0 && u > 0) {
        toast.success(`${n} nuevas importadas · ${u} actualizadas (ya existían)`);
      } else if (n > 0) {
        toast.success(`${n} preguntas importadas de YouTube`);
      } else if (u > 0) {
        toast.info(`${u} comentarios ya existían · actualizados sin duplicar`);
      } else {
        toast.info("Nada nuevo que importar");
      }
      
    } catch (error) {
      console.error("Error fetching YouTube comments:", error);
      toast.error(error.response?.data?.detail || "Error al obtener comentarios");
    } finally {
      setFetchingComments(false);
      setTimeout(() => setFetchProgress(0), 2000);
    }
  };

  const handleManualImport = async () => {
    if (!rawText.trim()) {
      toast.error("Pega los comentarios de YouTube primero");
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${API}/questions/import`, {
        raw_text: rawText
      });
      setResult(response.data);
      toast.success(`${response.data.questions_imported} preguntas importadas`);
    } catch (error) {
      console.error("Error importing:", error);
      toast.error(error.response?.data?.detail || "Error al importar comentarios");
    } finally {
      setLoading(false);
    }
  };

  const exampleText = `@usuario123 Hola, me gustaría saber cómo funciona el sistema de puntos. ¿Se pueden canjear por premios?

María García: Tengo una duda sobre el último video. ¿Podrías explicar mejor la parte de la configuración inicial?

Pedro López - Gracias por el contenido! Mi pregunta es: ¿Cuánto tiempo tarda normalmente el proceso?

@otro_usuario Otra pregunta de ejemplo con formato de username`;

  const renderLastAnchor = () => (
    <div className="p-4 bg-secondary/40 border border-border rounded-sm space-y-2" data-testid="last-import-info">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <History className="w-3 h-3" />
        <span>Última pregunta importada · corte actual</span>
      </div>
      {lastAnchor ? (
        <>
          <p className="text-sm leading-relaxed">
            <span className="italic">"{lastAnchor.raw_text?.length > 180
              ? lastAnchor.raw_text.slice(0, 180) + '…'
              : lastAnchor.raw_text}"</span>
          </p>
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>
              Usuario: <span className="font-medium text-foreground">{lastAnchor.raw_username || "Desconocido"}</span>
            </p>
            <p>
              Fecha del comentario: <span className="font-medium text-foreground">
                {lastAnchor.comment_published_at
                  ? new Date(lastAnchor.comment_published_at).toLocaleString('es-ES', {
                      day: '2-digit', month: '2-digit', year: 'numeric',
                      hour: '2-digit', minute: '2-digit'
                    })
                  : "Desconocida"}
              </span>
            </p>
            {lastAnchor.video_title && (
              <p>
                Vídeo: <span className="font-medium text-foreground">{lastAnchor.video_title}</span>
              </p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Este es el punto de corte que debes usar como referencia para no dejar preguntas fuera en la siguiente importación.
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Todavía no hay una última pregunta importada guardada. Se fijará automáticamente cuando entre la primera pregunta nueva desde YouTube.
        </p>
      )}
    </div>
  );

  return (
    <div className="p-8 md:p-12 animate-fade-in">
      {/* Header */}
      <div className="mb-12">
        <h1 className="font-heading text-4xl sm:text-5xl font-bold tracking-tight mb-2">
          IMPORTAR
        </h1>
        <p className="text-muted-foreground">
          Importa comentarios desde YouTube automáticamente o pégalos manualmente
        </p>
      </div>

      <Tabs defaultValue="youtube" className="space-y-8">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="youtube" className="flex items-center gap-2">
            <Youtube className="w-4 h-4" />
            Desde YouTube
          </TabsTrigger>
          <TabsTrigger value="manual" className="flex items-center gap-2">
            <Upload className="w-4 h-4" />
            Manual
          </TabsTrigger>
        </TabsList>

        {/* YouTube Import Tab */}
        <TabsContent value="youtube" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main YouTube Panel */}
            <div className="lg:col-span-2">
              <Card className="bg-card border border-border rounded-sm">
                <CardHeader>
                  <CardTitle className="font-heading text-xl uppercase tracking-tight flex items-center gap-2">
                    <Youtube className="w-5 h-5 text-red-500" />
                    IMPORTAR DESDE YOUTUBE
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {renderLastAnchor()}

                  {youtubeAuth.loading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : !youtubeAuth.authenticated ? (
                    /* Not authenticated - direct user to Configuración */
                    <div className="text-center py-8 space-y-4">
                      <Youtube className="w-16 h-16 mx-auto text-red-500 opacity-50" />
                      <div>
                        <h3 className="text-lg font-medium mb-2">Conecta tu cuenta de YouTube</h3>
                        <p className="text-sm text-muted-foreground mb-6">
                          Ve a <strong>Configuración → Cuenta de YouTube</strong> para conectar 
                          la cuenta de Google que quieras usar. Se abrirá una ventana emergente 
                          para elegir la cuenta correcta.
                        </p>
                        <Button 
                          onClick={() => window.location.href = '/configuracion'}
                          className="rounded-sm uppercase tracking-wide"
                          data-testid="go-to-config-button"
                        >
                          <Link2 className="w-4 h-4 mr-2" />
                          Ir a Configuración
                        </Button>
                      </div>
                    </div>
                  ) : (
                    /* Authenticated - show fetch options */
                    <div className="space-y-6">
                      <div className="flex items-center justify-between p-4 bg-green-500/10 border border-green-500/30 rounded-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                          <div className="min-w-0">
                            <span className="text-sm font-medium block">YouTube conectado</span>
                            {youtubeAuth.account_email && (
                              <span className="text-xs text-muted-foreground truncate block" data-testid="importer-youtube-email">
                                {youtubeAuth.account_email}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Date Range Selection */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="fecha-desde" className="text-xs uppercase tracking-wide">
                            Desde
                          </Label>
                          <Input
                            id="fecha-desde"
                            type="date"
                            value={fechaDesde}
                            onChange={(e) => setFechaDesde(e.target.value)}
                            className="rounded-sm"
                            data-testid="fecha-desde-input"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="fecha-hasta" className="text-xs uppercase tracking-wide">
                            Hasta
                          </Label>
                          <Input
                            id="fecha-hasta"
                            type="date"
                            value={fechaHasta}
                            onChange={(e) => setFechaHasta(e.target.value)}
                            className="rounded-sm"
                            data-testid="fecha-hasta-input"
                          />
                        </div>
                      </div>

                      {/* Optional manual cutoff */}
                      <div className="space-y-2">
                        <Label htmlFor="texto-corte" className="text-xs uppercase tracking-wide flex items-center gap-2">
                          <Link2 className="w-3 h-3" />
                          Texto de corte manual (opcional)
                        </Label>
                        <Textarea
                          id="texto-corte"
                          value={manualCutoffText}
                          onChange={(e) => setManualCutoffText(e.target.value)}
                          placeholder="Pega el texto exacto de un comentario donde quieras parar la descarga. Déjalo vacío para descargar todo el rango."
                          className="rounded-sm text-sm min-h-[70px] resize-none"
                          data-testid="texto-corte-input"
                        />
                      </div>

                      {/* Progress Bar */}
                      {fetchProgress > 0 && (
                        <div className="space-y-2">
                          <Progress value={fetchProgress} className="h-2" />
                          <p className="text-xs text-muted-foreground text-center">
                            {fetchProgress < 30 ? "Conectando con YouTube..." :
                             fetchProgress < 70 ? "Descargando comentarios..." :
                             fetchProgress < 100 ? "Importando preguntas..." :
                             "Completado"}
                          </p>
                        </div>
                      )}

                      {/* Fetch Button */}
                      <Button
                        onClick={handleFetchYouTubeComments}
                        disabled={fetchingComments || !fechaDesde || !fechaHasta}
                        className="w-full rounded-sm uppercase tracking-wide"
                        data-testid="fetch-youtube-button"
                      >
                        {fetchingComments ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Descargando...
                          </>
                        ) : (
                          <>
                            <Download className="w-4 h-4 mr-2" />
                            Descargar Comentarios
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* YouTube Result */}
              {youtubeResult && (
                <Card className="bg-card border border-primary/50 rounded-sm animate-fade-in">
                  <CardHeader>
                    <CardTitle className="font-heading text-lg uppercase tracking-tight flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-green-500" />
                      DESCARGADO
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Canal:</span>
                      <span className="font-medium text-sm">{youtubeResult.channel}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Videos:</span>
                      <span className="font-bold">{youtubeResult.videos_count}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Comentarios:</span>
                      <span className="font-bold">{youtubeResult.comments_count}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Saludos filtrados:</span>
                      <span className="text-yellow-600">{youtubeResult.greetings_filtered}</span>
                    </div>
                    {youtubeResult.imported && (
                      <div className="pt-3 border-t">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">Importados:</span>
                          <span className="font-bold text-lg text-primary">
                            {youtubeResult.imported.questions_imported}
                          </span>
                        </div>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground mt-4">
                      Ve al "Editor" para revisar las preguntas importadas.
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Instructions */}
              <Card className="bg-card border border-border rounded-sm">
                <CardHeader>
                  <CardTitle className="font-heading text-lg uppercase tracking-tight">
                    CONFIGURACIÓN
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="space-y-2">
                    <p className="font-medium">1. Google Cloud Console</p>
                    <p className="text-muted-foreground text-xs">
                      Crea un proyecto y habilita YouTube Data API v3
                    </p>
                  </div>
                  <div className="space-y-2">
                    <p className="font-medium">2. Credenciales OAuth</p>
                    <p className="text-muted-foreground text-xs">
                      Crea credenciales OAuth 2.0 para aplicación web
                    </p>
                  </div>
                  <div className="space-y-2">
                    <p className="font-medium">3. Configuración</p>
                    <p className="text-muted-foreground text-xs">
                      Añade Client ID y Client Secret en Ajustes
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Manual Import Tab */}
        <TabsContent value="manual" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Input */}
            <div className="lg:col-span-2">
              <Card className="bg-card border border-border rounded-sm">
                <CardHeader>
                  <CardTitle className="font-heading text-xl uppercase tracking-tight flex items-center gap-2">
                    <Upload className="w-5 h-5 text-primary" strokeWidth={1.5} />
                    IMPORTAR MANUALMENTE
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea
                    data-testid="import-textarea"
                    placeholder="Pega aquí los comentarios de YouTube...

Formatos aceptados:
@usuario1 Texto del comentario
Nombre Real: Texto del comentario
Nombre Real - Texto del comentario"
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    className="min-h-[400px] font-mono text-sm bg-background resize-none rounded-sm"
                  />
                  
                  <div className="flex items-center gap-4">
                    <Button
                      data-testid="import-button"
                      onClick={handleManualImport}
                      disabled={loading || !rawText.trim()}
                      className="rounded-sm uppercase tracking-wide font-medium"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Importando...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4 mr-2" />
                          Importar comentarios
                        </>
                      )}
                    </Button>
                    
                    <Button
                      variant="outline"
                      onClick={() => setRawText("")}
                      className="rounded-sm uppercase tracking-wide text-xs"
                      data-testid="clear-button"
                    >
                      Limpiar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Instructions */}
              <Card className="bg-card border border-border rounded-sm">
                <CardHeader>
                  <CardTitle className="font-heading text-lg uppercase tracking-tight">
                    INSTRUCCIONES
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="space-y-2">
                    <p className="font-medium">1. Ve a YouTube Studio</p>
                    <p className="text-muted-foreground text-xs">
                      Comunidad → Comentarios → Ordenar por fecha
                    </p>
                  </div>
                  <div className="space-y-2">
                    <p className="font-medium">2. Selecciona y copia</p>
                    <p className="text-muted-foreground text-xs">
                      Desde el último comentario respondido hasta la fecha actual
                    </p>
                  </div>
                  <div className="space-y-2">
                    <p className="font-medium">3. Pega aquí</p>
                    <p className="text-muted-foreground text-xs">
                      Formatos: <code className="bg-secondary px-1">@usuario texto</code> o <code className="bg-secondary px-1">Nombre: texto</code>
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Example */}
              <Card className="bg-secondary/30 border border-border rounded-sm">
                <CardHeader>
                  <CardTitle className="font-heading text-lg uppercase tracking-tight">
                    EJEMPLO
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">
                    {exampleText}
                  </pre>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setRawText(exampleText)}
                    className="mt-4 text-xs uppercase tracking-wide"
                    data-testid="use-example-button"
                  >
                    Usar ejemplo
                  </Button>
                </CardContent>
              </Card>

              {/* Result */}
              {result && (
                <Card className="bg-card border border-primary/50 rounded-sm animate-fade-in">
                  <CardHeader>
                    <CardTitle className="font-heading text-lg uppercase tracking-tight flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-green-500" />
                      IMPORTADO
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Lote ID:</span>
                      <span className="font-mono text-xs">{result.batch_id?.slice(0, 8)}...</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Preguntas:</span>
                      <span className="font-bold text-lg">{result.questions_imported}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-4">
                      Ve al "Editor" para revisar y corregir las preguntas importadas.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
