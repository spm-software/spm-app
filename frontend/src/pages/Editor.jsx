import { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
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
  Wand2, 
  Check, 
  Trash2, 
  AlertTriangle,
  Loader2,
  Search,
  Copy,
  User
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function Editor() {
  const [batches, setBatches] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState("");
  const [questions, setQuestions] = useState([]);
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [loading, setLoading] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);

  useEffect(() => {
    fetchBatches();
  }, []);

  useEffect(() => {
    if (selectedBatch) {
      fetchQuestions();
    }
  }, [selectedBatch]);

  const fetchBatches = async () => {
    try {
      const response = await axios.get(`${API}/batches`);
      setBatches(response.data);
      if (response.data.length > 0) {
        setSelectedBatch(response.data[0].id);
      }
    } catch (error) {
      console.error("Error fetching batches:", error);
    }
  };

  const fetchQuestions = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/questions`, {
        params: { batch_id: selectedBatch, include_greetings: true }
      });
      setQuestions(response.data);
      if (response.data.length > 0 && !selectedQuestion) {
        setSelectedQuestion(response.data[0]);
      }
    } catch (error) {
      console.error("Error fetching questions:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCorrectAll = async () => {
    setCorrecting(true);
    try {
      const response = await axios.post(`${API}/questions/correct-all/${selectedBatch}`);
      toast.success(`${response.data.corrected_count} preguntas corregidas`);
      fetchQuestions();
    } catch (error) {
      console.error("Error correcting:", error);
      toast.error("Error al corregir preguntas");
    } finally {
      setCorrecting(false);
    }
  };

  const handleCorrectSingle = async (questionId) => {
    setCorrecting(true);
    try {
      await axios.post(`${API}/questions/correct`, {
        question_ids: [questionId]
      });
      toast.success("Pregunta corregida");
      fetchQuestions();
    } catch (error) {
      console.error("Error correcting:", error);
      toast.error("Error al corregir pregunta");
    } finally {
      setCorrecting(false);
    }
  };

  const handleCheckDuplicates = async () => {
    setCheckingDuplicates(true);
    try {
      const response = await axios.post(`${API}/questions/check-duplicates/${selectedBatch}`);
      toast.success(`${response.data.duplicates_count} duplicados encontrados`);
      fetchQuestions();
    } catch (error) {
      console.error("Error checking duplicates:", error);
      toast.error("Error al buscar duplicados");
    } finally {
      setCheckingDuplicates(false);
    }
  };

  const handleToggleGreeting = async (question) => {
    try {
      await axios.put(`${API}/questions/${question.id}`, {
        is_greeting: !question.is_greeting
      });
      fetchQuestions();
    } catch (error) {
      console.error("Error updating question:", error);
    }
  };

  const handleUpdateQuestion = async (field, value) => {
    if (!selectedQuestion) return;
    try {
      await axios.put(`${API}/questions/${selectedQuestion.id}`, {
        [field]: value
      });
      fetchQuestions();
    } catch (error) {
      console.error("Error updating question:", error);
    }
  };

  const handleDeleteQuestion = async (questionId) => {
    try {
      await axios.delete(`${API}/questions/${questionId}`);
      toast.success("Pregunta eliminada");
      setSelectedQuestion(null);
      fetchQuestions();
    } catch (error) {
      console.error("Error deleting question:", error);
    }
  };

  const validQuestions = questions.filter(q => !q.is_greeting && !q.is_duplicate);

  return (
    <div className="p-8 md:p-12 animate-fade-in">
      {/* Header */}
      <div className="mb-8 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="font-heading text-4xl sm:text-5xl font-bold tracking-tight mb-2">
            EDITOR
          </h1>
          <p className="text-muted-foreground">
            Revisa, corrige y filtra las preguntas importadas
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

      {/* Actions Bar */}
      <div className="flex flex-wrap items-center gap-3 mb-6 p-4 bg-secondary/30 rounded-sm">
        <Button
          onClick={handleCorrectAll}
          disabled={correcting || questions.length === 0}
          className="rounded-sm uppercase tracking-wide text-xs"
          data-testid="correct-all-button"
        >
          {correcting ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Wand2 className="w-4 h-4 mr-2" />
          )}
          Corregir todo con IA
        </Button>
        
        <Button
          variant="outline"
          onClick={handleCheckDuplicates}
          disabled={checkingDuplicates || questions.length === 0}
          className="rounded-sm uppercase tracking-wide text-xs"
          data-testid="check-duplicates-button"
        >
          {checkingDuplicates ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Search className="w-4 h-4 mr-2" />
          )}
          Buscar duplicados
        </Button>

        <div className="flex-1" />
        
        <div className="text-sm text-muted-foreground">
          <span className="font-bold text-foreground">{validQuestions.length}</span> preguntas válidas
          {questions.filter(q => q.is_greeting).length > 0 && (
            <span className="ml-2">
              | <span className="text-yellow-600">{questions.filter(q => q.is_greeting).length}</span> saludos
            </span>
          )}
          {questions.filter(q => q.is_duplicate).length > 0 && (
            <span className="ml-2">
              | <span className="text-red-500">{questions.filter(q => q.is_duplicate).length}</span> duplicados
            </span>
          )}
        </div>
      </div>

      {/* Split View */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Questions List */}
        <Card className="bg-card border border-border rounded-sm">
          <CardHeader className="pb-3">
            <CardTitle className="font-heading text-lg uppercase tracking-tight">
              LISTA DE PREGUNTAS
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[600px]">
              {loading ? (
                <div className="p-6 text-center">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Cargando...</p>
                </div>
              ) : questions.length === 0 ? (
                <div className="p-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    No hay preguntas en este lote
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {questions.map((question) => (
                    <div
                      key={question.id}
                      onClick={() => setSelectedQuestion(question)}
                      className={`p-4 cursor-pointer transition-colors tracing-beam ${
                        selectedQuestion?.id === question.id 
                          ? "bg-secondary/50 active" 
                          : "hover:bg-secondary/30"
                      } ${question.is_greeting ? "opacity-50" : ""} ${
                        question.is_duplicate ? "border-l-2 border-l-red-500" : ""
                      }`}
                      data-testid={`question-item-${question.id}`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">
                            {question.youtube_username}
                          </span>
                          {question.real_name && question.real_name !== question.youtube_username && (
                            <span className="text-xs font-medium">
                              → {question.real_name}
                            </span>
                          )}
                        </div>
                        <div className="flex gap-1">
                          {question.is_corrected && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              <Check className="w-3 h-3" />
                            </Badge>
                          )}
                          {question.is_greeting && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-yellow-600 border-yellow-600">
                              Saludo
                            </Badge>
                          )}
                          {question.is_duplicate && (
                            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                              Duplicado
                            </Badge>
                          )}
                        </div>
                      </div>
                      <p className="text-sm line-clamp-2">
                        {question.corrected_text || question.original_text}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Editor Panel */}
        <Card className="bg-card border border-border rounded-sm">
          <CardHeader className="pb-3">
            <CardTitle className="font-heading text-lg uppercase tracking-tight">
              EDITAR PREGUNTA
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedQuestion ? (
              <div className="space-y-6">
                {/* User info */}
                <div className="p-4 bg-secondary/30 rounded-sm space-y-3">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-muted-foreground" />
                    <span className="font-mono text-sm">{selectedQuestion.youtube_username}</span>
                  </div>
                  <div>
                    <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Nombre Real
                    </label>
                    <Input
                      value={selectedQuestion.real_name || ""}
                      onChange={(e) => handleUpdateQuestion("real_name", e.target.value)}
                      placeholder="Nombre para mostrar"
                      className="mt-1 rounded-sm"
                      data-testid="real-name-input"
                    />
                  </div>
                </div>

                {/* Original text */}
                <div>
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Texto Original
                  </label>
                  <Textarea
                    value={selectedQuestion.original_text}
                    onChange={(e) => handleUpdateQuestion("original_text", e.target.value)}
                    className="mt-1 min-h-[120px] rounded-sm font-mono text-sm"
                    data-testid="original-text-textarea"
                  />
                </div>

                {/* Corrected text */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Texto Corregido
                    </label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCorrectSingle(selectedQuestion.id)}
                      disabled={correcting}
                      className="text-xs"
                      data-testid="correct-single-button"
                    >
                      {correcting ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <>
                          <Wand2 className="w-3 h-3 mr-1" />
                          Corregir
                        </>
                      )}
                    </Button>
                  </div>
                  <Textarea
                    value={selectedQuestion.corrected_text || ""}
                    onChange={(e) => handleUpdateQuestion("corrected_text", e.target.value)}
                    placeholder="El texto corregido aparecerá aquí..."
                    className="min-h-[120px] rounded-sm text-sm"
                    data-testid="corrected-text-textarea"
                  />
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 pt-4 border-t border-border">
                  <Button
                    variant={selectedQuestion.is_greeting ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => handleToggleGreeting(selectedQuestion)}
                    className="rounded-sm uppercase tracking-wide text-xs"
                    data-testid="toggle-greeting-button"
                  >
                    {selectedQuestion.is_greeting ? (
                      <>
                        <Check className="w-4 h-4 mr-1" />
                        Marcado como saludo
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-4 h-4 mr-1" />
                        Marcar como saludo
                      </>
                    )}
                  </Button>
                  
                  <div className="flex-1" />
                  
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDeleteQuestion(selectedQuestion.id)}
                    className="rounded-sm uppercase tracking-wide text-xs"
                    data-testid="delete-question-button"
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Eliminar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                <p className="text-sm">Selecciona una pregunta para editar</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
