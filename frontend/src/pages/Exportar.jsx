import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Download, 
  Loader2,
  Copy,
  FileText,
  Check,
  Image as ImageIcon,
  Eye,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { API_BASE_URL as API } from "@/lib/api";

export default function Exportar() {
  const [batches, setBatches] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState("");
  const [programs, setPrograms] = useState([]);
  const [selectedProgram, setSelectedProgram] = useState("");
  const [exportContent, setExportContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [pngLoadingProgram, setPngLoadingProgram] = useState("");
  const [pngPreviewLoadingProgram, setPngPreviewLoadingProgram] = useState("");
  const [pngPreview, setPngPreview] = useState(null);
  const [pngPreviewIndex, setPngPreviewIndex] = useState(0);
  const [copied, setCopied] = useState(false);

  const fetchBatches = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/batches`);
      setBatches(response.data);
      
      const storedBatch = sessionStorage.getItem('selectedBatch');
      if (storedBatch && response.data.some(b => b.id === storedBatch)) {
        setSelectedBatch(storedBatch);
        sessionStorage.removeItem('selectedBatch');
      } else if (response.data.length > 0) {
        setSelectedBatch(response.data[0].id);
      }
    } catch (error) {
      console.error("Error fetching batches:", error);
    }
  }, []);

  const fetchPrograms = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/programs`, {
        params: { batch_id: selectedBatch }
      });
      setPrograms(response.data);
    } catch (error) {
      console.error("Error fetching programs:", error);
    }
  }, [selectedBatch]);

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  useEffect(() => {
    if (selectedBatch) {
      fetchPrograms();
      setExportContent("");
      setSelectedProgram("");
      setPngPreview(null);
      setPngPreviewIndex(0);
    }
  }, [selectedBatch, fetchPrograms]);

  const handleExportProgram = async (programId) => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/programs/${programId}/export`);
      setExportContent(response.data.content);
      setSelectedProgram(programId);
      setPngPreview(null);
      setPngPreviewIndex(0);
      toast.success(`Exportado: ${response.data.question_count} preguntas`);
    } catch (error) {
      console.error("Error exporting:", error);
      toast.error("Error al exportar programa");
    } finally {
      setLoading(false);
    }
  };

  const handleExportAll = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/batches/${selectedBatch}/export-all`);
      const allContent = response.data.exports.map(exp => 
        `=== ${exp.program_name.toUpperCase()} (${exp.question_count} preguntas) ===\n\n${exp.content}`
      ).join('\n\n');
      setExportContent(allContent);
      setSelectedProgram("all");
      setPngPreview(null);
      setPngPreviewIndex(0);
      toast.success("Todos los programas exportados");
    } catch (error) {
      console.error("Error exporting all:", error);
      toast.error("Error al exportar todos los programas");
    } finally {
      setLoading(false);
    }
  };

  const getFilenameFromDisposition = (disposition, fallback) => {
    const match = disposition?.match(/filename="?([^"]+)"?/i);
    return match?.[1] || fallback;
  };

  const handleExportProgramPng = async (program) => {
    setPngLoadingProgram(program.id);
    try {
      const response = await axios.get(`${API}/programs/${program.id}/export-png`, {
        responseType: "blob",
      });
      const blob = new Blob([response.data], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const fallback = `${program.name.toLowerCase().replace(/[^a-z0-9]+/gi, "-")}-png.zip`;
      link.href = url;
      link.download = getFilenameFromDisposition(response.headers["content-disposition"], fallback);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("PNG descargados");
    } catch (error) {
      console.error("Error exporting PNG:", error);
      toast.error("Error al exportar PNG");
    } finally {
      setPngLoadingProgram("");
    }
  };

  const handlePreviewProgramPng = async (program) => {
    setPngPreviewLoadingProgram(program.id);
    try {
      const response = await axios.get(`${API}/programs/${program.id}/export-png-preview`);
      setPngPreview(response.data);
      setPngPreviewIndex(0);
      setExportContent("");
      setSelectedProgram(program.id);
      toast.success(`Vista previa: ${response.data.question_count} PNG`);
    } catch (error) {
      console.error("Error loading PNG preview:", error);
      toast.error("Error al cargar la vista previa PNG");
    } finally {
      setPngPreviewLoadingProgram("");
    }
  };

  const currentPngPreview = pngPreview?.previews?.[pngPreviewIndex];
  const previewProgram = programs.find((program) => program.id === pngPreview?.program_id);

  const handleCopy = () => {
    navigator.clipboard.writeText(exportContent);
    setCopied(true);
    toast.success("Copiado al portapapeles");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([exportContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const dateStr = new Date().toISOString().split('T')[0];
    link.download = `preguntas_${dateStr}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Archivo descargado");
  };

  return (
    <div className="p-8 md:p-12 animate-fade-in">
      {/* Header */}
      <div className="mb-8 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="font-heading text-4xl sm:text-5xl font-bold tracking-tight mb-2">
            EXPORTAR
          </h1>
          <p className="text-muted-foreground">
            Genera el archivo TXT con las preguntas formateadas
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <Select value={selectedBatch} onValueChange={setSelectedBatch}>
            <SelectTrigger className="w-48 rounded-sm" data-testid="batch-selector">
              <SelectValue placeholder="Seleccionar lote" />
            </SelectTrigger>
            <SelectContent>
              {batches.map((batch) => (
                <SelectItem key={batch.id} value={batch.id}>
                  {new Date(batch.created_at).toLocaleDateString('es-ES')} ({batch.question_count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Programs List */}
        <Card className="bg-card border border-border rounded-sm">
          <CardHeader>
            <CardTitle className="font-heading text-lg uppercase tracking-tight">
              PROGRAMAS
            </CardTitle>
          </CardHeader>
          <CardContent>
            {programs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No hay programas distribuidos. Ve a "Distribuir" primero.
              </p>
            ) : (
              <div className="space-y-2">
                <Button
                  variant={selectedProgram === "all" ? "default" : "outline"}
                  onClick={handleExportAll}
                  disabled={loading}
                  className="w-full rounded-sm uppercase tracking-wide text-xs justify-start"
                  data-testid="export-all-button"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Exportar todos
                </Button>
                
                <div className="border-t border-border my-4" />
                
                {programs.map((program) => (
                  <div key={program.id} className="flex gap-2">
                    <Button
                      variant={selectedProgram === program.id ? "secondary" : "ghost"}
                      onClick={() => handleExportProgram(program.id)}
                      disabled={loading || Boolean(pngLoadingProgram)}
                      className="min-w-0 flex-1 rounded-sm justify-between"
                      data-testid={`export-program-${program.number}`}
                    >
                      <span className="truncate text-sm">{program.name}</span>
                      <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                        {program.question_count}
                      </span>
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handlePreviewProgramPng(program)}
                      disabled={loading || Boolean(pngLoadingProgram) || Boolean(pngPreviewLoadingProgram) || program.question_count === 0}
                      className="w-16 shrink-0 rounded-sm uppercase tracking-wide text-xs"
                      data-testid={`preview-program-png-${program.number}`}
                    >
                      {pngPreviewLoadingProgram === program.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Eye className="w-4 h-4 mr-1" />
                      )}
                      Ver
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handleExportProgramPng(program)}
                      disabled={loading || Boolean(pngLoadingProgram) || Boolean(pngPreviewLoadingProgram) || program.question_count === 0}
                      className="w-20 shrink-0 rounded-sm uppercase tracking-wide text-xs"
                      data-testid={`export-program-png-${program.number}`}
                    >
                      {pngLoadingProgram === program.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <ImageIcon className="w-4 h-4 mr-1" />
                      )}
                      PNG
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Export Preview */}
        <Card className="bg-card border border-border rounded-sm lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="font-heading text-lg uppercase tracking-tight flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                VISTA PREVIA
              </CardTitle>
              {(exportContent || pngPreview) && (
                <div className="flex items-center gap-2">
                  {exportContent && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopy}
                      className="rounded-sm uppercase tracking-wide text-xs"
                      data-testid="copy-button"
                    >
                      {copied ? (
                        <Check className="w-4 h-4 mr-1" />
                      ) : (
                        <Copy className="w-4 h-4 mr-1" />
                      )}
                      {copied ? "Copiado" : "Copiar"}
                    </Button>
                  )}
                  {pngPreview && previewProgram && (
                    <Button
                      size="sm"
                      onClick={() => handleExportProgramPng(previewProgram)}
                      disabled={Boolean(pngLoadingProgram)}
                      className="rounded-sm uppercase tracking-wide text-xs"
                      data-testid="download-preview-png-button"
                    >
                      {pngLoadingProgram === previewProgram.id ? (
                        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4 mr-1" />
                      )}
                      Descargar ZIP
                    </Button>
                  )}
                  {exportContent && (
                    <Button
                      size="sm"
                      onClick={handleDownload}
                      className="rounded-sm uppercase tracking-wide text-xs"
                      data-testid="download-button"
                    >
                      <Download className="w-4 h-4 mr-1" />
                      Descargar TXT
                    </Button>
                  )}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {loading || pngPreviewLoadingProgram ? (
              <div className="h-[500px] flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : pngPreview && currentPngPreview ? (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{pngPreview.program_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {pngPreviewIndex + 1} de {pngPreview.question_count} · {currentPngPreview.filename}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPngPreviewIndex((index) => Math.max(index - 1, 0))}
                      disabled={pngPreviewIndex === 0}
                      className="rounded-sm"
                      data-testid="png-preview-prev"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPngPreviewIndex((index) => Math.min(index + 1, pngPreview.previews.length - 1))}
                      disabled={pngPreviewIndex >= pngPreview.previews.length - 1}
                      className="rounded-sm"
                      data-testid="png-preview-next"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div className="h-[440px] border border-border rounded-sm bg-secondary/30 flex items-center justify-center overflow-hidden">
                  <img
                    src={currentPngPreview.image}
                    alt={currentPngPreview.filename}
                    className="max-h-full max-w-full object-contain"
                    data-testid="png-preview-image"
                  />
                </div>
              </div>
            ) : exportContent ? (
              <ScrollArea className="h-[500px] border border-border rounded-sm">
                <pre className="export-preview p-4 whitespace-pre-wrap">
                  {exportContent}
                </pre>
              </ScrollArea>
            ) : (
              <div className="h-[500px] flex flex-col items-center justify-center text-muted-foreground">
                <FileText className="w-12 h-12 mb-4" />
                <p className="text-sm">Selecciona un programa para ver la vista previa</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Format Info */}
      <Card className="bg-secondary/30 border border-border rounded-sm mt-8 max-w-2xl">
        <CardContent className="p-6">
          <h3 className="font-heading text-sm uppercase tracking-wide mb-3">
            FORMATO DE SALIDA
          </h3>
          <pre className="text-xs text-muted-foreground font-mono bg-background p-4 rounded-sm">
{`Nombre del Usuario
Texto de la pregunta (corregido si disponible)

[línea en blanco]

Siguiente Usuario
Su pregunta...`}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
