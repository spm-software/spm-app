import { useEffect, useState, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  Wand2, 
  Check, 
  Trash2, 
  AlertTriangle,
  Loader2,
  Search,
  MessageSquare,
  Pencil,
  CheckCircle,
  Copy,
  X,
  ArrowRight
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Componente separado para editar nombre
const EditableName = ({ question, onSave }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [localName, setLocalName] = useState(question.real_name || "");
  const inputRef = useRef(null);

  useEffect(() => {
    setLocalName(question.real_name || "");
  }, [question.real_name]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = () => {
    if (localName !== question.real_name) {
      onSave(question.id, "real_name", localName);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      setLocalName(question.real_name || "");
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <Input
        ref={inputRef}
        value={localName}
        onChange={(e) => setLocalName(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className="h-8 w-48 rounded-sm text-sm font-medium"
        placeholder="Nombre para mostrar"
        data-testid={`name-input-${question.id}`}
      />
    );
  }

  return (
    <button
      onClick={() => setIsEditing(true)}
      className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-secondary/50 transition-colors group flex-shrink-0"
      data-testid={`name-edit-button-${question.id}`}
    >
      <span className="font-medium text-sm">
        {question.real_name || "Sin nombre"}
      </span>
      <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
};

// Componente separado para editar texto
const EditableText = ({ question, onSave }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [localText, setLocalText] = useState(question.corrected_text || question.original_text);
  const textareaRef = useRef(null);

  useEffect(() => {
    setLocalText(question.corrected_text || question.original_text);
  }, [question.corrected_text, question.original_text]);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isEditing]);

  const handleSave = () => {
    const field = question.corrected_text ? "corrected_text" : "original_text";
    if (localText !== (question.corrected_text || question.original_text)) {
      onSave(question.id, field, localText);
    }
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <Textarea
        ref={textareaRef}
        value={localText}
        onChange={(e) => setLocalText(e.target.value)}
        onBlur={handleSave}
        className="rounded-sm text-base leading-relaxed min-h-[100px] w-full"
        data-testid={`text-textarea-${question.id}`}
      />
    );
  }

  return (
    <div 
      onClick={() => setIsEditing(true)}
      className="cursor-text p-3 rounded-sm bg-secondary/30 hover:bg-secondary/50 transition-colors"
    >
      <p className="text-base leading-relaxed whitespace-pre-wrap">
        {question.corrected_text || question.original_text}
      </p>
    </div>
  );
};

// Modal de duplicados
const DuplicatesModal = ({ open, onClose, duplicates, onDelete, onKeep }) => {
  if (!duplicates || duplicates.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl uppercase tracking-tight flex items-center gap-2">
            <Copy className="w-5 h-5 text-primary" />
            DUPLICADOS ENCONTRADOS ({duplicates.length})
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto space-y-6 pr-2">
          {duplicates.map((dup, index) => (
            <div key={index} className="border border-border rounded-sm p-4 bg-card">
              {/* Header */}
              <div className="flex items-center gap-2 mb-4">
                <Badge variant={dup.type === "in_history" ? "destructive" : "secondary"}>
                  {dup.type === "in_history" ? "En historial" : "En este lote"}
                </Badge>
                <Badge variant="outline">{dup.similarity}% similar</Badge>
              </div>
              
              {/* Comparison */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* New question */}
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-primary">
                    Nueva pregunta (importada ahora)
                  </p>
                  <div className="p-3 bg-primary/5 border border-primary/20 rounded-sm">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-mono text-xs text-muted-foreground">
                        {dup.new_question.username}
                      </span>
                      {dup.new_question.real_name && (
                        <span className="text-xs font-medium">
                          → {dup.new_question.real_name}
                        </span>
                      )}
                    </div>
                    <p className="text-sm leading-relaxed">
                      {dup.new_question.text}
                    </p>
                  </div>
                </div>
                
                {/* Original question */}
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Pregunta original {dup.type === "in_history" && "(anterior)"}
                  </p>
                  <div className="p-3 bg-secondary/50 border border-border rounded-sm">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-mono text-xs text-muted-foreground">
                        {dup.original_question.username}
                      </span>
                      {dup.original_question.real_name && (
                        <span className="text-xs font-medium">
                          → {dup.original_question.real_name}
                        </span>
                      )}
                    </div>
                    <p className="text-sm leading-relaxed">
                      {dup.original_question.text}
                    </p>
                    {dup.original_question.created_at && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Fecha: {new Date(dup.original_question.created_at).toLocaleDateString('es-ES')}
                      </p>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Actions */}
              <div className="flex items-center gap-3 mt-4 pt-4 border-t border-border">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => onDelete(dup.new_question.id)}
                  className="rounded-sm text-xs"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" />
                  Eliminar nueva
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onKeep(dup.new_question.id)}
                  className="rounded-sm text-xs"
                >
                  <Check className="w-3.5 h-3.5 mr-1" />
                  Mantener ambas
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDelete(dup.original_question.id)}
                  className="rounded-sm text-xs text-muted-foreground"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" />
                  Eliminar original
                </Button>
              </div>
            </div>
          ))}
        </div>
        
        <div className="pt-4 border-t border-border flex justify-end">
          <Button onClick={onClose} className="rounded-sm">
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default function Editor() {
  const [batches, setBatches] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState("");
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [correctingId, setCorrectingId] = useState(null);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [duplicates, setDuplicates] = useState([]);
  const [showDuplicatesModal, setShowDuplicatesModal] = useState(false);

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
      setDuplicates(response.data.duplicates);
      if (response.data.duplicates.length > 0) {
        setShowDuplicatesModal(true);
        toast.info(`${response.data.duplicates_count} duplicados encontrados`);
      } else {
        toast.success("No se encontraron duplicados");
      }
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
      setQuestions(prev => prev.map(q => 
        q.id === question.id ? { ...q, is_greeting: !q.is_greeting } : q
      ));
      toast.success(question.is_greeting ? "Desmarcado como saludo" : "Marcado como saludo");
    } catch (error) {
      console.error("Error updating question:", error);
    }
  };

  const handleUpdateQuestion = async (questionId, field, value) => {
    try {
      await axios.put(`${API}/questions/${questionId}`, {
        [field]: value
      });
      setQuestions(prev => prev.map(q => 
        q.id === questionId ? { ...q, [field]: value } : q
      ));
    } catch (error) {
      console.error("Error updating question:", error);
      toast.error("Error al guardar");
    }
  };

  const handleDeleteQuestion = async (questionId) => {
    const scrollY = window.scrollY;
    try {
      await axios.delete(`${API}/questions/${questionId}`);
      setQuestions(prev => prev.filter(q => q.id !== questionId));
      setDuplicates(prev => prev.filter(d => 
        d.new_question.id !== questionId && d.original_question.id !== questionId
      ));
      toast.success("Pregunta eliminada");
      requestAnimationFrame(() => {
        window.scrollTo(0, scrollY);
      });
    } catch (error) {
      console.error("Error deleting question:", error);
    }
  };

  const handleKeepBoth = async (questionId) => {
    try {
      await axios.put(`${API}/questions/${questionId}/clear-duplicate`);
      setQuestions(prev => prev.map(q => 
        q.id === questionId ? { ...q, is_duplicate: false, duplicate_of: null } : q
      ));
      setDuplicates(prev => prev.filter(d => d.new_question.id !== questionId));
      toast.success("Pregunta mantenida");
    } catch (error) {
      console.error("Error clearing duplicate:", error);
    }
  };

  const handleAcceptQuestion = async (question) => {
    try {
      const updates = { is_corrected: true };
      if (!question.corrected_text) {
        updates.corrected_text = question.original_text;
      }
      await axios.put(`${API}/questions/${question.id}`, updates);
      setQuestions(prev => prev.map(q => 
        q.id === question.id ? { ...q, ...updates } : q
      ));
      toast.success("Pregunta aceptada");
    } catch (error) {
      console.error("Error accepting question:", error);
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

        {duplicates.length > 0 && (
          <Button
            variant="secondary"
            onClick={() => setShowDuplicatesModal(true)}
            size="lg"
            className="rounded-sm uppercase tracking-wide text-xs"
          >
            <Copy className="w-4 h-4 mr-2" />
            Ver {duplicates.length} duplicados
          </Button>
        )}

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

      {/* Questions List */}
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
                question.is_greeting ? "opacity-50 border-yellow-500/50 bg-yellow-500/5" : 
                question.is_duplicate ? "opacity-50 border-red-500/50 bg-red-500/5" : 
                "border-border hover:border-foreground/20"
              }`}
              data-testid={`question-card-${question.id}`}
            >
              <CardContent className="p-5">
                {/* Header Row */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm flex-shrink-0">
                    {index + 1}
                  </div>
                  
                  <span className="font-mono text-xs text-muted-foreground bg-secondary/50 px-2 py-1 rounded flex-shrink-0">
                    {question.youtube_username}
                  </span>
                  
                  <span className="text-muted-foreground flex-shrink-0">→</span>
                  
                  <EditableName question={question} onSave={handleUpdateQuestion} />
                  
                  <div className="flex gap-2 ml-auto flex-shrink-0">
                    {question.is_corrected && (
                      <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 border-green-300">
                        <Check className="w-3 h-3 mr-1" />
                        Corregido
                      </Badge>
                    )}
                    {question.is_greeting && (
                      <Badge variant="outline" className="text-xs text-yellow-700 border-yellow-500 bg-yellow-50">
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
                
                {/* Question Text */}
                <div className="mb-4">
                  <EditableText question={question} onSave={handleUpdateQuestion} />
                </div>
                
                {/* Action Buttons */}
                <div className="flex items-center gap-2 pt-3 border-t border-border">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCorrectSingle(question.id)}
                    disabled={correctingId === question.id}
                    className="rounded-sm text-xs"
                    data-testid={`correct-btn-${question.id}`}
                  >
                    {correctingId === question.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Wand2 className="w-3.5 h-3.5" />
                    )}
                    <span className="ml-1.5 hidden sm:inline">Corregir IA</span>
                  </Button>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleAcceptQuestion(question)}
                    className="rounded-sm text-xs text-green-600 border-green-300 hover:bg-green-50 hover:text-green-700"
                    data-testid={`accept-btn-${question.id}`}
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span className="ml-1.5 hidden sm:inline">Aceptar</span>
                  </Button>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleToggleGreeting(question)}
                    className={`rounded-sm text-xs ${
                      question.is_greeting 
                        ? "text-yellow-700 border-yellow-500 bg-yellow-50" 
                        : "text-muted-foreground"
                    }`}
                    data-testid={`greeting-btn-${question.id}`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span className="ml-1.5 hidden sm:inline">
                      {question.is_greeting ? "Es saludo" : "Saludo"}
                    </span>
                  </Button>
                  
                  <div className="flex-1" />
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteQuestion(question.id)}
                    className="rounded-sm text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                    data-testid={`delete-btn-${question.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span className="ml-1.5 hidden sm:inline">Eliminar</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Duplicates Modal */}
      <DuplicatesModal
        open={showDuplicatesModal}
        onClose={() => setShowDuplicatesModal(false)}
        duplicates={duplicates}
        onDelete={handleDeleteQuestion}
        onKeep={handleKeepBoth}
      />
    </div>
  );
}
