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
  ArrowRight,
  Users,
  Sparkles
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

// Componente para editar username (@...)
const EditableUsername = ({ question, onSave }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [localUsername, setLocalUsername] = useState(question.youtube_username || "");
  const inputRef = useRef(null);

  useEffect(() => {
    setLocalUsername(question.youtube_username || "");
  }, [question.youtube_username]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = () => {
    if (localUsername !== question.youtube_username) {
      // Ensure it starts with @
      const username = localUsername.startsWith('@') ? localUsername : `@${localUsername}`;
      onSave(question.id, "youtube_username", username);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      setLocalUsername(question.youtube_username || "");
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <Input
        ref={inputRef}
        value={localUsername}
        onChange={(e) => setLocalUsername(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className="h-7 w-40 rounded-sm text-xs font-mono bg-secondary/50"
        placeholder="@username"
        data-testid={`username-input-${question.id}`}
      />
    );
  }

  return (
    <button
      onClick={() => setIsEditing(true)}
      className="font-mono text-xs text-muted-foreground bg-secondary/50 px-2 py-1 rounded flex-shrink-0 hover:bg-secondary transition-colors group flex items-center gap-1"
      title="Click para editar username"
      data-testid={`username-edit-button-${question.id}`}
    >
      {question.youtube_username}
      <Pencil className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
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
const DuplicatesModal = ({ open, onClose, duplicates, onDelete, onKeep, currentBatchName, batches }) => {
  if (!duplicates || duplicates.length === 0) return null;

  const formatBatchInfo = (question, type, isNewQuestion = false) => {
    // For new question, use current batch info
    if (isNewQuestion) {
      return currentBatchName || "Importación actual";
    }
    
    // For original question, get the batch info
    if (question.batch_name) {
      return question.batch_name;
    }
    
    if (question.batch_date) {
      return new Date(question.batch_date).toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    }
    
    // Try to find batch in the batches list
    if (question.batch_id && batches) {
      const batch = batches.find(b => b.id === question.batch_id);
      if (batch) {
        return batch.name || new Date(batch.created_at).toLocaleDateString('es-ES', {
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        });
      }
    }
    
    // Last resort - show batch_id shortened
    if (question.batch_id) {
      return `Lote ${question.batch_id.slice(0, 8)}...`;
    }
    
    return "Desconocido";
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="pb-4 border-b">
          <DialogTitle className="font-heading text-2xl uppercase tracking-tight flex items-center gap-3">
            <Copy className="w-6 h-6 text-red-500" />
            COMPARAR DUPLICADOS
            <Badge variant="destructive" className="text-base px-3 py-1">{duplicates.length}</Badge>
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-2">
            Elige qué pregunta conservar. Ambas son del <strong>mismo usuario</strong>.
          </p>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto py-4">
          {duplicates.map((dup, index) => (
            <div key={index} className="mb-8 last:mb-0">
              {/* User header */}
              <div className="flex items-center gap-3 mb-4 pb-2 border-b-2 border-primary">
                <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                  {index + 1}
                </div>
                <div>
                  <p className="font-bold text-lg">{dup.new_question.real_name || dup.new_question.username}</p>
                  <p className="text-xs text-muted-foreground font-mono">{dup.new_question.username}</p>
                </div>
                <Badge variant={dup.type === "ai_detected" || dup.type === "ai_same_batch" ? "default" : "destructive"} className="ml-auto">
                  {dup.type === "ai_detected" || dup.type === "ai_same_batch" ? "Detectado por IA" : `${dup.similarity}% similar`}
                </Badge>
              </div>
              
              {/* Side by side comparison */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Question A */}
                <div className="relative">
                  <div className="absolute -top-3 left-4 bg-white px-2">
                    <Badge variant="outline" className="text-xs font-bold bg-blue-50 text-blue-700 border-blue-300">
                      PREGUNTA A - {formatBatchInfo(dup.new_question, dup.type, true)}
                    </Badge>
                  </div>
                  <div className="border-2 border-blue-300 rounded-lg p-5 pt-6 bg-blue-50/30 min-h-[200px]">
                    <p className="text-base leading-relaxed whitespace-pre-wrap">
                      {dup.new_question.text}
                    </p>
                  </div>
                  <div className="mt-3 flex justify-center">
                    <Button
                      variant="default"
                      size="lg"
                      onClick={() => {
                        onDelete(dup.original_question.id);
                        onClose();
                      }}
                      className="rounded-full px-8 bg-blue-600 hover:bg-blue-700"
                    >
                      <Check className="w-5 h-5 mr-2" />
                      CONSERVAR ESTA
                    </Button>
                  </div>
                </div>
                
                {/* Question B */}
                <div className="relative">
                  <div className="absolute -top-3 left-4 bg-white px-2">
                    <Badge variant="outline" className="text-xs font-bold bg-amber-50 text-amber-700 border-amber-300">
                      PREGUNTA B - {formatBatchInfo(dup.original_question, dup.type, false)}
                    </Badge>
                  </div>
                  <div className="border-2 border-amber-300 rounded-lg p-5 pt-6 bg-amber-50/30 min-h-[200px]">
                    <p className="text-base leading-relaxed whitespace-pre-wrap">
                      {dup.original_question.text}
                    </p>
                  </div>
                  <div className="mt-3 flex justify-center">
                    <Button
                      variant="default"
                      size="lg"
                      onClick={() => {
                        onDelete(dup.new_question.id);
                        onClose();
                      }}
                      className="rounded-full px-8 bg-amber-600 hover:bg-amber-700"
                    >
                      <Check className="w-5 h-5 mr-2" />
                      CONSERVAR ESTA
                    </Button>
                  </div>
                </div>
              </div>
              
              {/* Alternative actions */}
              <div className="flex justify-center gap-4 mt-4 pt-4 border-t border-dashed">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onKeep(dup.new_question.id)}
                  className="rounded-sm text-xs text-muted-foreground"
                >
                  Mantener ambas (no son duplicados)
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    onDelete(dup.new_question.id);
                    onDelete(dup.original_question.id);
                    onClose();
                  }}
                  className="rounded-sm text-xs text-red-500 hover:text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" />
                  Eliminar ambas
                </Button>
              </div>
              
              {index < duplicates.length - 1 && (
                <div className="border-b-4 border-dotted border-muted mt-8" />
              )}
            </div>
          ))}
        </div>
        
        <div className="pt-4 border-t flex justify-between items-center">
          <p className="text-sm text-muted-foreground">
            {duplicates.length} par{duplicates.length > 1 ? 'es' : ''} de duplicados por revisar
          </p>
          <Button onClick={onClose} variant="outline" className="rounded-sm">
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Modal de búsqueda global
const SearchModal = ({ open, onClose }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async () => {
    if (searchTerm.length < 2) {
      toast.error("Escribe al menos 2 caracteres");
      return;
    }
    
    setSearching(true);
    setHasSearched(true);
    try {
      const response = await axios.get(`${process.env.REACT_APP_BACKEND_URL}/api/questions/search`, {
        params: { q: searchTerm }
      });
      setResults(response.data.results);
    } catch (error) {
      console.error("Error searching:", error);
      toast.error("Error al buscar");
    } finally {
      setSearching(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl uppercase tracking-tight flex items-center gap-2">
            <Search className="w-5 h-5 text-primary" />
            BUSCAR EN TODAS LAS PREGUNTAS
          </DialogTitle>
        </DialogHeader>
        
        {/* Search Input */}
        <div className="flex gap-2 py-4">
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar por texto, nombre de usuario..."
            className="flex-1 rounded-sm"
            autoFocus
          />
          <Button 
            onClick={handleSearch} 
            disabled={searching || searchTerm.length < 2}
            className="rounded-sm"
          >
            {searching ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
          </Button>
        </div>
        
        {/* Results */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-2">
          {searching ? (
            <div className="py-12 text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
              <p className="text-muted-foreground">Buscando...</p>
            </div>
          ) : hasSearched && results.length === 0 ? (
            <div className="py-12 text-center">
              <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No se encontraron resultados para "{searchTerm}"</p>
            </div>
          ) : results.length > 0 ? (
            <>
              <p className="text-sm text-muted-foreground mb-4">
                {results.length} resultado{results.length !== 1 ? 's' : ''} encontrado{results.length !== 1 ? 's' : ''}
              </p>
              {results.map((result) => (
                <div 
                  key={result.id}
                  className="border border-border rounded-sm p-4 bg-card hover:border-primary/30 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-mono text-xs text-muted-foreground bg-secondary/50 px-2 py-1 rounded">
                      {result.youtube_username}
                    </span>
                    {result.real_name && (
                      <>
                        <span className="text-muted-foreground">→</span>
                        <span className="text-sm font-medium">{result.real_name}</span>
                      </>
                    )}
                    <div className="ml-auto flex items-center gap-2">
                      {result.batch_date && (
                        <Badge variant="outline" className="text-xs">
                          {new Date(result.batch_date).toLocaleDateString('es-ES')}
                        </Badge>
                      )}
                      {result.is_duplicate && (
                        <Badge variant="destructive" className="text-xs">Duplicado</Badge>
                      )}
                    </div>
                  </div>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {result.corrected_text || result.original_text}
                  </p>
                </div>
              ))}
            </>
          ) : (
            <div className="py-12 text-center">
              <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Escribe un término y pulsa buscar</p>
              <p className="text-xs text-muted-foreground mt-2">Busca en todas las preguntas del sistema</p>
            </div>
          )}
        </div>
        
        <div className="pt-4 border-t border-border flex justify-end">
          <Button variant="outline" onClick={onClose} className="rounded-sm">
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
  const [correctingProgress, setCorrectingProgress] = useState({ current: 0, total: 0 });
  const [correctingId, setCorrectingId] = useState(null);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [duplicates, setDuplicates] = useState([]);
  const [showDuplicatesModal, setShowDuplicatesModal] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showOnlyDuplicates, setShowOnlyDuplicates] = useState(false);
  const [aiModel, setAiModel] = useState("gpt-5.2");
  const initialBatchLoaded = useRef(false);

  const AI_MODELS = [
    { value: "gpt-5.2", label: "GPT-5.2 (OpenAI)", provider: "openai" },
    { value: "gpt-4o", label: "GPT-4o (OpenAI)", provider: "openai" },
    { value: "claude-sonnet-4-5", label: "Claude Sonnet 4.5", provider: "anthropic" },
    { value: "gemini-3-flash", label: "Gemini 3 Flash", provider: "gemini" },
  ];

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
      
      // Check if there's a selected batch from Dashboard (only on first load)
      if (!initialBatchLoaded.current) {
        initialBatchLoaded.current = true;
        const storedBatch = sessionStorage.getItem('selectedBatch');
        if (storedBatch && response.data.some(b => b.id === storedBatch)) {
          setSelectedBatch(storedBatch);
          sessionStorage.removeItem('selectedBatch');
        } else if (response.data.length > 0 && !selectedBatch) {
          setSelectedBatch(response.data[0].id);
        }
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
    setCorrectingProgress({ current: 0, total: 0 });
    
    try {
      // First, get the list of questions to correct
      const initResponse = await axios.post(`${API}/questions/correct-all/${selectedBatch}`);
      const questionIds = initResponse.data.question_ids;
      const total = questionIds.length;
      
      if (total === 0) {
        toast.info("No hay preguntas pendientes de corregir");
        setCorrecting(false);
        fetchQuestions();
        return;
      }
      
      setCorrectingProgress({ current: 0, total });
      
      // Process in batches of 5
      const batchSize = 5;
      let correctedCount = 0;
      let errorCount = 0;
      
      for (let i = 0; i < questionIds.length; i += batchSize) {
        const batch = questionIds.slice(i, i + batchSize);
        
        try {
          const response = await axios.post(`${API}/questions/correct-batch`, {
            question_ids: batch
          });
          correctedCount += response.data.corrected.length;
          errorCount += response.data.errors.length;
        } catch (error) {
          console.error("Error in batch:", error);
          errorCount += batch.length;
        }
        
        setCorrectingProgress({ current: Math.min(i + batchSize, total), total });
      }
      
      if (errorCount > 0) {
        toast.warning(`${correctedCount} corregidas, ${errorCount} errores`);
      } else {
        toast.success(`${correctedCount} preguntas corregidas`);
      }
      
      fetchQuestions();
    } catch (error) {
      console.error("Error correcting:", error);
      toast.error("Error al iniciar corrección");
    } finally {
      setCorrecting(false);
      setCorrectingProgress({ current: 0, total: 0 });
    }
  };

  const handleUpdateNames = async () => {
    const scrollY = window.scrollY;
    try {
      const response = await axios.post(`${API}/questions/update-names/${selectedBatch}`);
      toast.success(`${response.data.updated_count} nombres actualizados`);
      await fetchQuestions();
      requestAnimationFrame(() => {
        window.scrollTo(0, scrollY);
      });
    } catch (error) {
      console.error("Error updating names:", error);
      toast.error("Error al actualizar nombres");
    }
  };

  const handleCorrectSingle = async (questionId) => {
    const scrollY = window.scrollY;
    setCorrectingId(questionId);
    try {
      await axios.post(`${API}/questions/correct`, {
        question_ids: [questionId]
      });
      toast.success("Pregunta corregida");
      await fetchQuestions();
      requestAnimationFrame(() => {
        window.scrollTo(0, scrollY);
      });
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

  const handleCheckDuplicatesAI = async () => {
    setCheckingDuplicates(true);
    const modelLabel = AI_MODELS.find(m => m.value === aiModel)?.label || aiModel;
    toast.info(`Buscando duplicados con ${modelLabel}... esto puede tardar hasta 1 minuto`, { duration: 10000 });
    try {
      const response = await axios.post(`${API}/questions/check-duplicates-ai/${selectedBatch}`, {
        model: aiModel
      }, {
        timeout: 180000 // 3 minutes timeout for AI processing
      });
      setDuplicates(response.data.duplicates);
      if (response.data.duplicates.length > 0) {
        setShowDuplicatesModal(true);
        toast.success(`${response.data.duplicates_count} duplicados encontrados con ${modelLabel}`);
      } else {
        toast.success(`No se encontraron duplicados con ${modelLabel}`);
      }
      fetchQuestions();
    } catch (error) {
      console.error("Error checking duplicates with AI:", error);
      if (error.code === 'ECONNABORTED') {
        toast.error("La búsqueda tardó demasiado. Intenta con menos preguntas.");
      } else {
        toast.error("Error al buscar duplicados con IA");
      }
    } finally {
      setCheckingDuplicates(false);
    }
  };

  const handleViewDuplicate = async (question) => {
    // First check if we already have this duplicate in memory
    const existingDup = duplicates.find(d => 
      d.new_question.id === question.id || d.original_question.id === question.id
    );
    
    if (existingDup) {
      setDuplicates([existingDup]);
      setShowDuplicatesModal(true);
      return;
    }
    
    // If not, fetch the duplicate directly by ID
    if (question.duplicate_of) {
      try {
        const response = await axios.get(`${API}/questions/by-id/${question.duplicate_of}`);
        const originalQ = response.data;
        
        // Get current batch info
        const currentBatch = batches.find(b => b.id === selectedBatch);
        
        setDuplicates([{
          new_question: {
            id: question.id,
            username: question.youtube_username,
            real_name: question.real_name,
            text: question.corrected_text || question.original_text
          },
          original_question: {
            id: originalQ.id,
            username: originalQ.youtube_username,
            real_name: originalQ.real_name,
            text: originalQ.corrected_text || originalQ.original_text,
            batch_name: originalQ.batch_name,
            batch_date: originalQ.batch_date
          },
          type: "ai_detected",
          similarity: 100
        }]);
        setShowDuplicatesModal(true);
      } catch (error) {
        console.error("Error finding duplicate:", error);
        if (error.response?.status === 404) {
          toast.error("La pregunta original fue eliminada");
          // Clear the duplicate flag since original no longer exists
          await axios.put(`${API}/questions/${question.id}`, {
            is_duplicate: false,
            duplicate_of: null
          });
          fetchQuestions();
        } else {
          toast.error("Error al buscar el duplicado");
        }
      }
    } else {
      // No duplicate_of set, need to run AI check
      toast.info("Ejecuta 'DUPLICADOS CON IA' para encontrar la pregunta original");
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
      // Update batch list to reflect new count
      fetchBatches();
      toast.success("Pregunta eliminada");
      requestAnimationFrame(() => {
        window.scrollTo(0, scrollY);
      });
    } catch (error) {
      console.error("Error deleting question:", error);
      toast.error("Error al eliminar pregunta");
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
          className="rounded-sm uppercase tracking-wide text-xs min-w-[200px]"
          data-testid="correct-all-button"
        >
          {correcting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {correctingProgress.total > 0 
                ? `Corrigiendo ${correctingProgress.current}/${correctingProgress.total}...`
                : "Iniciando..."
              }
            </>
          ) : (
            <>
              <Wand2 className="w-4 h-4 mr-2" />
              Corregir todo con IA
            </>
          )}
        </Button>
        
        {/* Progress bar */}
        {correcting && correctingProgress.total > 0 && (
          <div className="flex-1 max-w-xs">
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${(correctingProgress.current / correctingProgress.total) * 100}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {Math.round((correctingProgress.current / correctingProgress.total) * 100)}% completado
            </p>
          </div>
        )}
        
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
          Duplicados (rápido)
        </Button>

        <div className="flex items-center gap-2">
          <Select value={aiModel} onValueChange={setAiModel}>
            <SelectTrigger className="w-[180px] h-10 rounded-sm text-xs">
              <SelectValue placeholder="Modelo IA" />
            </SelectTrigger>
            <SelectContent>
              {AI_MODELS.map(model => (
                <SelectItem key={model.value} value={model.value} className="text-xs">
                  {model.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Button
            variant="default"
            onClick={handleCheckDuplicatesAI}
            disabled={checkingDuplicates || questions.length === 0}
            size="lg"
            className="rounded-sm uppercase tracking-wide text-xs bg-primary"
            data-testid="check-duplicates-ai-button"
          >
            {checkingDuplicates ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 mr-2" />
            )}
            Buscar con IA
          </Button>
        </div>

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

        <Button
          variant="outline"
          onClick={() => setShowSearchModal(true)}
          size="lg"
          className="rounded-sm uppercase tracking-wide text-xs"
          data-testid="search-all-button"
        >
          <Search className="w-4 h-4 mr-2" />
          Buscar en todo
        </Button>

        <Button
          variant="outline"
          onClick={handleUpdateNames}
          disabled={questions.length === 0}
          size="lg"
          className="rounded-sm uppercase tracking-wide text-xs"
          data-testid="update-names-button"
        >
          <Users className="w-4 h-4 mr-2" />
          Actualizar nombres
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
            <button
              onClick={() => setShowOnlyDuplicates(!showOnlyDuplicates)}
              className={`flex items-center gap-2 px-3 py-1 rounded transition-colors cursor-pointer border ${
                showOnlyDuplicates 
                  ? 'bg-red-500 text-white border-red-500' 
                  : 'hover:bg-red-50 border-red-300'
              }`}
              title={showOnlyDuplicates ? "Ver todas las preguntas" : "Filtrar solo duplicados"}
            >
              <div className={`w-3 h-3 rounded-full ${showOnlyDuplicates ? 'bg-white' : 'bg-red-500'}`} />
              <span className={`font-medium ${showOnlyDuplicates ? '' : 'text-red-600'}`}>
                <strong>{questions.filter(q => q.is_duplicate).length}</strong> duplicados
              </span>
            </button>
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
          (showOnlyDuplicates ? questions.filter(q => q.is_duplicate) : questions).map((question, index) => (
            <Card 
              key={question.id}
              className={`bg-card border rounded-sm transition-all ${
                question.is_greeting ? "opacity-50 border-yellow-500/50 bg-yellow-500/5" : 
                question.is_duplicate ? "border-red-500 bg-red-500/5" : 
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
                  
                  <EditableUsername question={question} onSave={handleUpdateQuestion} />
                  
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
                      <Badge 
                        variant="destructive" 
                        className="text-xs cursor-pointer hover:bg-red-700"
                        onClick={() => handleViewDuplicate(question)}
                        title="Ver pregunta duplicada"
                      >
                        Duplicado - Click para comparar
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
        batches={batches}
        currentBatchName={batches.find(b => b.id === selectedBatch)?.name || 
          (batches.find(b => b.id === selectedBatch)?.created_at ? 
            new Date(batches.find(b => b.id === selectedBatch).created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : 
            'Importación actual')}
      />

      <SearchModal
        open={showSearchModal}
        onClose={() => setShowSearchModal(false)}
      />
    </div>
  );
}
