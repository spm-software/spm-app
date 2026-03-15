import { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Layers, 
  Loader2,
  ChevronRight,
  Archive,
  BarChart3,
  Trash2,
  AlertCircle
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function Distribuidor() {
  const [batches, setBatches] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState("");
  const [numPrograms, setNumPrograms] = useState("4");
  const [programs, setPrograms] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [distributing, setDistributing] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    fetchBatches();
  }, []);

  useEffect(() => {
    if (selectedBatch) {
      fetchPrograms();
      fetchQuestions();
    }
  }, [selectedBatch]);

  const fetchBatches = async () => {
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
  };

  const fetchPrograms = async () => {
    try {
      const response = await axios.get(`${API}/programs`, {
        params: { batch_id: selectedBatch }
      });
      setPrograms(response.data);
    } catch (error) {
      console.error("Error fetching programs:", error);
    }
  };

  const fetchQuestions = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/questions`, {
        params: { batch_id: selectedBatch }
      });
      setQuestions(response.data);
    } catch (error) {
      console.error("Error fetching questions:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDistribute = async () => {
    setDistributing(true);
    try {
      const response = await axios.post(`${API}/programs/distribute`, {
        batch_id: selectedBatch,
        num_programs: parseInt(numPrograms)
      });
      toast.success(`Distribuido en ${response.data.programs_created} programas`);
      fetchPrograms();
      fetchQuestions();
    } catch (error) {
      console.error("Error distributing:", error);
      toast.error(error.response?.data?.detail || "Error al distribuir");
    } finally {
      setDistributing(false);
    }
  };

  const handleClearDistribution = async () => {
    if (!window.confirm("¿Estás seguro de eliminar la distribución? Esto borrará todos los programas y podrás redistribuir.")) {
      return;
    }
    
    setClearing(true);
    try {
      await axios.delete(`${API}/programs/clear/${selectedBatch}`);
      toast.success("Distribución eliminada");
      setPrograms([]);
      fetchQuestions();
    } catch (error) {
      console.error("Error clearing distribution:", error);
      toast.error("Error al eliminar la distribución");
    } finally {
      setClearing(false);
    }
  };

  const getQuestionsForProgram = (programId) => {
    return questions
      .filter(q => q.program_id === programId)
      .sort((a, b) => (a.order_in_program || 999) - (b.order_in_program || 999));
  };

  const validQuestions = questions.filter(q => !q.is_greeting && !q.is_duplicate);
  const undistributed = validQuestions.filter(q => !q.program_id);

  return (
    <div className="p-8 md:p-12 animate-fade-in">
      {/* Header */}
      <div className="mb-8 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="font-heading text-4xl sm:text-5xl font-bold tracking-tight mb-2">
            DISTRIBUIR
          </h1>
          <p className="text-muted-foreground">
            Organiza las preguntas en programas siguiendo las reglas
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

      {/* Distribution Controls */}
      <Card className="bg-card border border-border rounded-sm mb-8">
        <CardContent className="p-6">
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground block mb-2">
                Número de programas
              </label>
              <Select value={numPrograms} onValueChange={setNumPrograms}>
                <SelectTrigger className="w-32 rounded-sm" data-testid="num-programs-selector">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 programa</SelectItem>
                  <SelectItem value="2">2 programas</SelectItem>
                  <SelectItem value="3">3 programas</SelectItem>
                  <SelectItem value="4">4 programas</SelectItem>
                  <SelectItem value="5">5 programas</SelectItem>
                  <SelectItem value="6">6 programas</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1" />

            <div className="text-right text-sm">
              <p className="text-muted-foreground">
                Preguntas válidas: <span className="font-bold text-foreground">{validQuestions.length}</span>
              </p>
              {undistributed.length > 0 && (
                <p className="text-yellow-600">
                  Sin distribuir: {undistributed.length}
                </p>
              )}
            </div>

            <Button
              onClick={handleDistribute}
              disabled={distributing || clearing || validQuestions.length === 0}
              className="rounded-sm uppercase tracking-wide"
              data-testid="distribute-button"
            >
              {distributing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Distribuyendo...
                </>
              ) : (
                <>
                  <Layers className="w-4 h-4 mr-2" />
                  Distribuir en {numPrograms} {numPrograms === "1" ? "programa" : "programas"}
                </>
              )}
            </Button>

            {programs.length > 0 && (
              <Button
                variant="outline"
                onClick={handleClearDistribution}
                disabled={distributing || clearing}
                className="rounded-sm uppercase tracking-wide text-destructive hover:text-destructive"
                data-testid="clear-distribution-button"
              >
                {clearing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Limpiando...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Limpiar
                  </>
                )}
              </Button>
            )}
          </div>

          {/* Rules reminder */}
          <div className="mt-6 pt-6 border-t border-border">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3">
              REGLAS DE DISTRIBUCIÓN
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="flex items-start gap-2">
                <ChevronRight className="w-4 h-4 text-primary mt-0.5" />
                <span>Máximo 2 preguntas por persona por programa</span>
              </div>
              <div className="flex items-start gap-2">
                <ChevronRight className="w-4 h-4 text-primary mt-0.5" />
                <span>Mantiene orden cronológico</span>
              </div>
              <div className="flex items-start gap-2">
                <ChevronRight className="w-4 h-4 text-primary mt-0.5" />
                <span>Excedentes van a Reserva</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Programs Grid */}
      {programs.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 stagger-children">
          {programs.map((program) => {
            const programQuestions = getQuestionsForProgram(program.id);
            return (
              <Card 
                key={program.id} 
                className={`bg-card border rounded-sm ${
                  program.is_reserve 
                    ? "border-yellow-500/50 bg-yellow-500/5" 
                    : "border-border"
                }`}
                data-testid={`program-card-${program.number}`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="font-heading text-lg uppercase tracking-tight flex items-center gap-2">
                      {program.is_reserve ? (
                        <Archive className="w-5 h-5 text-yellow-500" />
                      ) : (
                        <BarChart3 className="w-5 h-5 text-primary" />
                      )}
                      {program.name}
                    </CardTitle>
                    <Badge 
                      variant={program.is_reserve ? "outline" : "secondary"}
                      className="rounded-full"
                    >
                      {program.question_count} preguntas
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <ScrollArea className="h-64">
                    {programQuestions.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        Sin preguntas asignadas
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {programQuestions.map((q, idx) => {
                          // Check if real_name is just the username without @
                          const username = (q.youtube_username || '').replace('@', '').toLowerCase();
                          const realName = (q.real_name || '').toLowerCase().trim();
                          const hasRealName = q.real_name && 
                                              q.real_name.trim() !== '' && 
                                              (realName !== username || q.real_name_confirmed);
                          return (
                            <div 
                              key={q.id}
                              className={`p-3 rounded-sm ${!hasRealName ? 'bg-yellow-500/10 border border-yellow-500/30' : 'bg-secondary/30'}`}
                            >
                              <div className="flex items-center gap-2 mb-1">
                                <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-bold">
                                  {idx + 1}
                                </span>
                                <span className={`text-xs font-medium truncate ${!hasRealName ? 'text-yellow-600' : ''}`}>
                                  {q.real_name || q.youtube_username}
                                </span>
                                {!hasRealName && (
                                  <AlertCircle className="w-3 h-3 text-yellow-500 flex-shrink-0" title="Sin nombre real registrado" />
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground line-clamp-2 ml-7">
                                {q.corrected_text || q.original_text}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="bg-card border border-border rounded-sm">
          <CardContent className="py-16 text-center">
            <Layers className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-heading text-xl mb-2">SIN DISTRIBUCIÓN</h3>
            <p className="text-muted-foreground text-sm">
              Selecciona el número de programas y haz clic en "Distribuir" para organizar las preguntas.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
