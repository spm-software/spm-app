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
  User,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Pencil
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function Editor() {
  const [batches, setBatches] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState("");
  const [questions, setQuestions] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [editingNameId, setEditingNameId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [correctingId, setCorrectingId] = useState(null);
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
    setCorrectingId(questionId);
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
      setCorrectingId(null);
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

  const handleUpdateQuestion = async (questionId, field, value) => {
    try {
      await axios.put(`${API}/questions/${questionId}`, {
        [field]: value
      });
      // Update local state for immediate feedback
      setQuestions(prev => prev.map(q => 
        q.id === questionId ? { ...q, [field]: value } : q
      ));
    } catch (error) {
      console.error("Error updating question:", error);
    }
  };

  const handleDeleteQuestion = async (questionId) => {
    try {
      await axios.delete(`${API}/questions/${questionId}`);
      toast.success("Pregunta eliminada");
      setExpandedId(null);
      fetchQuestions();
    } catch (error) {
      console.error("Error deleting question:", error);
    }
  };

  const handleNameKeyDown = (e, questionId) => {
    if (e.key === 'Enter') {
      setEditingNameId(null);
    }
    if (e.key === 'Escape') {
      setEditingNameId(null);
    }
  };

  const validQuestions = questions.filter(q => !q.is_greeting && !q.is_duplicate);

  return (
    <div className="p-6 md:p-10 animate-fade-in">
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
            <SelectTrigger className="w-56 rounded-sm" data-testid="batch-selector">
              <SelectValue placeholder="Seleccionar lote" />
            </SelectTrigger>
            <SelectContent>
              {batches.map((batch) => (
                <SelectItem key={batch.id} value={batch.id}>
                  {new Date(batch.created_at).toLocaleDateString('es-ES')} ({batch.question_count} preguntas)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Actions Bar */}
      <div className="flex flex-wrap items-center gap-4 mb-8 p-5 bg-card border border-border rounded-sm">
        <Button
          onClick={handleCorrectAll}
          disabled={correcting || questions.length === 0}
          size="lg"
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
          size="lg"
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
        
        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span><strong>{validQuestions.length}</strong> válidas</span>
          </div>
          {questions.filter(q => q.is_greeting).length > 0 && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <span><strong>{questions.filter(q => q.is_greeting).length}</strong> saludos</span>
            </div>
          )}
          {questions.filter(q => q.is_duplicate).length > 0 && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <span><strong>{questions.filter(q => q.is_duplicate).length}</strong> duplicados</span>
            </div>
          )}
        </div>
      </div>

      {/* Questions List - Full Width Cards */}
      <div className="space-y-4">
        {loading ? (
          <div className="py-16 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Cargando preguntas...</p>
          </div>
        ) : questions.length === 0 ? (
          <Card className="bg-card border border-border rounded-sm">
            <CardContent className="py-16 text-center">
              <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-heading text-xl mb-2">SIN PREGUNTAS</h3>
              <p className="text-muted-foreground">
                No hay preguntas en este lote. Ve a "Importar" para añadir comentarios.
              </p>
            </CardContent>
          </Card>
        ) : (
          questions.map((question, index) => (
            <Card 
              key={question.id}
              className={`bg-card border rounded-sm transition-all ${
                question.is_greeting ? "opacity-60 border-yellow-500/30" : 
                question.is_duplicate ? "opacity-60 border-red-500/30" : 
                "border-border hover:border-foreground/20"
              } ${expandedId === question.id ? "ring-2 ring-primary/20" : ""}`}
              data-testid={`question-card-${question.id}`}
            >
              {/* Question Header - Always Visible */}
              <div className="p-5">
                <div className="flex items-start gap-4">
                  {/* Number */}
                  <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold flex-shrink-0">
                    {index + 1}
                  </div>
                  
                  {/* Main Content */}
                  <div className="flex-1 min-w-0">
                    {/* User Info Row - EDITABLE NAME */}
                    <div className="flex items-center gap-3 mb-3">
                      <span className="font-mono text-xs text-muted-foreground bg-secondary/50 px-2 py-1 rounded">
                        {question.youtube_username}
                      </span>
                      <span className="text-muted-foreground">→</span>
                      
                      {/* Editable Name Field */}
                      {editingNameId === question.id ? (
                        <Input
                          value={question.real_name || ""}
                          onChange={(e) => handleUpdateQuestion(question.id, "real_name", e.target.value)}
                          onBlur={() => setEditingNameId(null)}
                          onKeyDown={(e) => handleNameKeyDown(e, question.id)}
                          className="h-8 w-48 rounded-sm text-sm font-medium"
                          placeholder="Nombre para mostrar"
                          autoFocus
                          data-testid={`name-input-${question.id}`}
                        />
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingNameId(question.id);
                          }}
                          className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-secondary/50 transition-colors group"
                          data-testid={`name-edit-button-${question.id}`}
                        >
                          <span className="font-medium">
                            {question.real_name || "Sin nombre"}
                          </span>
                          <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      )}
                      
                      {/* Badges */}
                      <div className="flex gap-2 ml-auto">
                        {question.is_corrected && (
                          <Badge variant="secondary" className="text-xs">
                            <Check className="w-3 h-3 mr-1" />
                            Corregido
                          </Badge>
                        )}
                        {question.is_greeting && (
                          <Badge variant="outline" className="text-xs text-yellow-600 border-yellow-500">
                            Saludo
                          </Badge>
                        )}
                        {question.is_duplicate && (
                          <Badge variant="destructive" className="text-xs">
                            Duplicado
                          </Badge>
                        )}
                      </div>
                    </div>
                    
                    {/* Question Text Preview - Clickable to expand */}
                    <div 
                      onClick={() => setExpandedId(expandedId === question.id ? null : question.id)}
                      className="cursor-pointer"
                    >
                      <p className={`text-base leading-relaxed ${expandedId === question.id ? "" : "line-clamp-2"}`}>
                        {question.corrected_text || question.original_text}
                      </p>
                    </div>
                  </div>
                  
                  {/* Expand Icon */}
                  <div 
                    className="flex-shrink-0 text-muted-foreground cursor-pointer p-2 hover:bg-secondary/50 rounded"
                    onClick={() => setExpandedId(expandedId === question.id ? null : question.id)}
                  >
                    {expandedId === question.id ? (
                      <ChevronUp className="w-5 h-5" />
                    ) : (
                      <ChevronDown className="w-5 h-5" />
                    )}
                  </div>
                </div>
              </div>
              
              {/* Expanded Editor */}
              {expandedId === question.id && (
                <div className="px-5 pb-6 pt-2 border-t border-border bg-secondary/20">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Left Column - Original */}
                    <div className="space-y-4">
                      {/* Original Text */}
                      <div>
                        <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground block mb-2">
                          Texto original
                        </label>
                        <Textarea
                          value={question.original_text}
                          onChange={(e) => handleUpdateQuestion(question.id, "original_text", e.target.value)}
                          className="rounded-sm font-mono text-sm min-h-[200px] leading-relaxed"
                          data-testid="original-text-textarea"
                        />
                      </div>
                    </div>
                    
                    {/* Right Column - Corrected */}
                    <div className="space-y-4">
                      {/* Corrected Text */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                            Texto corregido
                          </label>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCorrectSingle(question.id);
                            }}
                            disabled={correctingId === question.id}
                            className="rounded-sm text-xs"
                            data-testid="correct-single-button"
                          >
                            {correctingId === question.id ? (
                              <Loader2 className="w-3 h-3 animate-spin mr-1" />
                            ) : (
                              <Wand2 className="w-3 h-3 mr-1" />
                            )}
                            Corregir con IA
                          </Button>
                        </div>
                        <Textarea
                          value={question.corrected_text || ""}
                          onChange={(e) => handleUpdateQuestion(question.id, "corrected_text", e.target.value)}
                          placeholder="El texto corregido aparecerá aquí o escríbelo manualmente..."
                          className="rounded-sm text-base min-h-[200px] leading-relaxed"
                          data-testid="corrected-text-textarea"
                        />
                      </div>
                    </div>
                  </div>
                  
                  {/* Action Buttons */}
                  <div className="flex items-center gap-3 pt-4 mt-4 border-t border-border">
                    <Button
                      variant={question.is_greeting ? "secondary" : "outline"}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleGreeting(question);
                      }}
                      className="rounded-sm uppercase tracking-wide text-xs"
                      data-testid="toggle-greeting-button"
                    >
                      {question.is_greeting ? (
                        <>
                          <Check className="w-4 h-4 mr-2" />
                          Es saludo
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-4 h-4 mr-2" />
                          Marcar saludo
                        </>
                      )}
                    </Button>
                    
                    <div className="flex-1" />
                    
                    <Button
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedId(null);
                      }}
                      className="rounded-sm text-xs"
                    >
                      Cerrar
                    </Button>
                    
                    <Button
                      variant="destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteQuestion(question.id);
                      }}
                      className="rounded-sm uppercase tracking-wide text-xs"
                      data-testid="delete-question-button"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Eliminar
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
