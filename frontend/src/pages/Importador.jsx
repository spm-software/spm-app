import { useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Upload, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function Importador() {
  const [rawText, setRawText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleImport = async () => {
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
          Pega los comentarios copiados de YouTube Studio
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Input */}
        <div className="lg:col-span-2">
          <Card className="bg-card border border-border rounded-sm">
            <CardHeader>
              <CardTitle className="font-heading text-xl uppercase tracking-tight flex items-center gap-2">
                <Upload className="w-5 h-5 text-primary" strokeWidth={1.5} />
                COMENTARIOS
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
                  onClick={handleImport}
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
    </div>
  );
}
