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
  Youtube,
  Calendar,
  Link2,
  Download,
  AlertTriangle
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function Importador() {
  // Manual import state
  const [rawText, setRawText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  
  // YouTube import state
  const [youtubeAuth, setYoutubeAuth] = useState({ authenticated: false, loading: true });
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [ultimoComentarioId, setUltimoComentarioId] = useState("");
  const [fetchingComments, setFetchingComments] = useState(false);
  const [fetchProgress, setFetchProgress] = useState(0);
  const [youtubeResult, setYoutubeResult] = useState(null);

  // Check YouTube auth status on mount
  useEffect(() => {
    checkYoutubeAuth();
    
    // Handle OAuth callback
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    if (code) {
      handleOAuthCallback(code);
    }
  }, []);

  const checkYoutubeAuth = async () => {
    try {
      const response = await axios.get(`${API}/youtube/auth-status`);
      setYoutubeAuth({ 
        ...response.data, 
        loading: false 
      });
      
      // Pre-fill last comment if available
      if (response.data.last_import?.last_comment_id) {
        setUltimoComentarioId(response.data.last_import.last_comment_id);
      }
      
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

  const handleConnectYouTube = async () => {
    try {
      const redirectUri = `${window.location.origin}${window.location.pathname}`;
      const response = await axios.get(`${API}/youtube/auth-url`, {
        params: { redirect_uri: redirectUri }
      });
      
      // Redirect to Google OAuth
      window.location.href = response.data.auth_url;
      
    } catch (error) {
      console.error("Error getting auth URL:", error);
      toast.error(error.response?.data?.detail || "Error al conectar con YouTube");
    }
  };

  const handleOAuthCallback = async (code) => {
    try {
      const redirectUri = `${window.location.origin}${window.location.pathname}`;
      
      await axios.post(`${API}/youtube/callback`, {
        code: code,
        redirect_uri: redirectUri
      });
      
      toast.success("YouTube conectado exitosamente");
      
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
      
      // Refresh auth status
      checkYoutubeAuth();
      
    } catch (error) {
      console.error("OAuth callback error:", error);
      toast.error("Error al autenticar con YouTube");
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  };

  const handleDisconnectYouTube = async () => {
    if (!window.confirm("¿Desconectar YouTube?")) return;
    
    try {
      await axios.delete(`${API}/youtube/disconnect`);
      setYoutubeAuth({ authenticated: false, loading: false });
      toast.success("YouTube desconectado");
    } catch (error) {
      toast.error("Error al desconectar");
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
      
      const response = await axios.post(`${API}/youtube/fetch-comments`, {
        fecha_desde: fechaDesde,
        fecha_hasta: fechaHasta,
        ultimo_comentario_id: ultimoComentarioId || null
      });
      
      setFetchProgress(70);
      
      if (response.data.comments_count === 0) {
        toast.info("No se encontraron comentarios en ese período");
        setYoutubeResult(response.data);
        setFetchProgress(100);
        return;
      }
      
      // Now import the comments
      const commentsText = response.data.comments.map(c => 
        `${c.youtube_username} ${c.text}`
      ).join('\n\n');
      
      setFetchProgress(85);
      
      const importResponse = await axios.post(`${API}/questions/import`, {
        raw_text: commentsText
      });
      
      setFetchProgress(100);
      
      setYoutubeResult({
        ...response.data,
        imported: importResponse.data
      });
      
      // Update last comment for next time
      if (response.data.last_comment_id) {
        setUltimoComentarioId(response.data.last_comment_id);
      }
      
      toast.success(`${importResponse.data.questions_imported} preguntas importadas de YouTube`);
      
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
                  {youtubeAuth.loading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : !youtubeAuth.authenticated ? (
                    /* Not authenticated - show connect button */
                    <div className="text-center py-8 space-y-4">
                      <Youtube className="w-16 h-16 mx-auto text-red-500 opacity-50" />
                      <div>
                        <h3 className="text-lg font-medium mb-2">Conecta tu canal de YouTube</h3>
                        <p className="text-sm text-muted-foreground mb-6">
                          Autoriza el acceso para descargar comentarios automáticamente
                        </p>
                        <Button 
                          onClick={handleConnectYouTube}
                          className="bg-red-600 hover:bg-red-700 rounded-sm uppercase tracking-wide"
                          data-testid="connect-youtube-button"
                        >
                          <Youtube className="w-4 h-4 mr-2" />
                          Conectar con YouTube
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-4">
                        Necesitas configurar las credenciales de YouTube en Ajustes primero.
                      </p>
                    </div>
                  ) : (
                    /* Authenticated - show fetch options */
                    <div className="space-y-6">
                      <div className="flex items-center justify-between p-4 bg-green-500/10 border border-green-500/30 rounded-sm">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-5 h-5 text-green-500" />
                          <span className="text-sm font-medium">YouTube conectado</span>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={handleDisconnectYouTube}
                          className="text-xs"
                        >
                          Desconectar
                        </Button>
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

                      {/* Cutoff Point */}
                      <div className="space-y-2">
                        <Label htmlFor="ultimo-comentario" className="text-xs uppercase tracking-wide flex items-center gap-2">
                          <Link2 className="w-3 h-3" />
                          Hasta este comentario (opcional)
                        </Label>
                        <Input
                          id="ultimo-comentario"
                          type="text"
                          value={ultimoComentarioId}
                          onChange={(e) => setUltimoComentarioId(e.target.value)}
                          placeholder="ID del último comentario importado"
                          className="rounded-sm font-mono text-xs"
                          data-testid="ultimo-comentario-input"
                        />
                        <p className="text-xs text-muted-foreground">
                          La descarga se detendrá al llegar a este comentario. Se guarda automáticamente de la última importación.
                        </p>
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

                      {/* Last Import Info */}
                      {youtubeAuth.last_import && (
                        <div className="p-4 bg-secondary/30 rounded-sm text-xs space-y-1">
                          <p className="font-medium">Última importación:</p>
                          <p className="text-muted-foreground">
                            {youtubeAuth.last_import.comments_count} comentarios · 
                            {new Date(youtubeAuth.last_import.date).toLocaleDateString('es-ES')}
                          </p>
                          {youtubeAuth.last_import.last_comment_text && (
                            <p className="text-muted-foreground truncate">
                              Último: "{youtubeAuth.last_import.last_comment_text}..."
                            </p>
                          )}
                        </div>
                      )}
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
