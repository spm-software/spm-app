import { useCallback, useEffect, useState, useRef } from "react";
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
  Users,
  Sparkles,
  Filter,
  Ban
} from "lucide-react";
import { API_BASE_URL as API } from "@/lib/api";

/**
 * Returns one of three states for a question's real_name:
 *   - "confirmed" → green: real_name_confirmed === true
 *   - "missing"   → red: NOT confirmed AND real_name equals youtube_username (strict, without @)
 *                       — also treats empty/null real_name as missing for robustness
 *   - "auto"      → yellow: real_name set to something different from username, not confirmed
 */
export const getNameState = (q) => {
  if (q?.real_name_confirmed === true) return "confirmed";
  const unameClean = (q?.youtube_username || "").replace(/^@+/, "").toLowerCase().trim();
  const rnClean = (q?.real_name || "").replace(/^@+/, "").toLowerCase().trim();
  if (!rnClean) return "missing";
  if (rnClean === unameClean) return "missing";
  return "auto";
};

const isGreetingQuestion = (q) => q?.is_greeting === true || q?.clasificacion === "saludo";

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

  const resizeTextarea = () => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
  };

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      resizeTextarea();
    }
  }, [isEditing]);

  useEffect(() => {
    if (isEditing) {
      resizeTextarea();
    }
  }, [isEditing, localText]);

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
        className="rounded-sm text-base leading-relaxed min-h-[100px] w-full resize-none overflow-hidden"
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
    // First, try to use the question's own batch info (works for both new and original)
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
    
    // For new question without batch info, use current batch as fallback
    if (isNewQuestion && currentBatchName) {
      return currentBatchName;
    }
    
    // Last resort - show batch_id shortened if available
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
      const response = await axios.get(`${API}/questions/search`, {
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
  const [correctingMode, setCorrectingMode] = useState(null);
  const [correctingProgress, setCorrectingProgress] = useState({ current: 0, total: 0 });
  const [correctingId, setCorrectingId] = useState(null);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [duplicateProgress, setDuplicateProgress] = useState({ current: 0, total: 0, percentage: 0, duplicatesFound: 0 });
  const [duplicates, setDuplicates] = useState([]);
  const [showDuplicatesModal, setShowDuplicatesModal] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showOnlyDuplicates, setShowOnlyDuplicates] = useState(false);
  const [showOnlyNoName, setShowOnlyNoName] = useState(false);
  const [clasificationFilter, setClasificationFilter] = useState("dudoso"); // "all" | "pregunta" | "dudoso" | "saludo"
  const [clasifying, setClasifying] = useState(false);
  const [clasifyProgress, setClasifyProgress] = useState({ current: 0, total: 0, percentage: 0 });
  const clasifyPollRef = useRef(null);
  const [aiModel, setAiModel] = useState("gpt-5.4-mini");
  const initialBatchLoaded = useRef(false);
  const pollingIntervalRef = useRef(null);

  const AI_MODELS = [
    { value: "gpt-5.4-mini", label: "GPT-5.4 Mini", provider: "openai" },
    { value: "gpt-5.4", label: "GPT-5.4", provider: "openai" },
    { value: "gpt-5.2", label: "GPT-5.2", provider: "openai" },
    { value: "gpt-4o-mini", label: "GPT-4o Mini", provider: "openai" },
  ];

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
      if (clasifyPollRef.current) {
        clearInterval(clasifyPollRef.current);
      }
    };
  }, []);

  const fetchBatches = useCallback(async () => {
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
        } else if (response.data.length > 0) {
          setSelectedBatch(currentBatch => currentBatch || response.data[0].id);
        }
      }
    } catch (error) {
      console.error("Error fetching batches:", error);
    }
  }, []);

  const fetchQuestions = useCallback(async () => {
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
  }, [selectedBatch]);

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  useEffect(() => {
    if (selectedBatch) {
      fetchQuestions();
    }
  }, [selectedBatch, fetchQuestions]);

  const handleCorrectAll = async (force = false) => {
    if (force && !window.confirm("¿Recorregir todas las preguntas válidas de este lote? Esto volverá a consumir créditos IA.")) {
      return;
    }

    setCorrecting(true);
    setCorrectingMode(force ? "recorrect" : "correct");
    setCorrectingProgress({ current: 0, total: 0 });
    
    try {
      // First, get the list of questions to correct
      const initResponse = await axios.post(`${API}/questions/correct-all/${selectedBatch}`, null, {
        params: { force }
      });
      const questionIds = initResponse.data.question_ids;
      const total = questionIds.length;
      
      if (total === 0) {
        toast.info(force ? "No hay preguntas válidas para recorregir" : "No hay preguntas pendientes de corregir");
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
          }, {
            params: { force }
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
        toast.warning(`${correctedCount} ${force ? "recorregidas" : "corregidas"}, ${errorCount} errores`);
      } else {
        toast.success(`${correctedCount} preguntas ${force ? "recorregidas" : "corregidas"}`);
      }
      
      fetchQuestions();
    } catch (error) {
      console.error("Error correcting:", error);
      toast.error("Error al iniciar corrección");
    } finally {
      setCorrecting(false);
      setCorrectingMode(null);
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
    setDuplicateProgress({ current: 0, total: 0, percentage: 0, duplicatesFound: 0 });
    const modelLabel = AI_MODELS.find(m => m.value === aiModel)?.label || aiModel;
    
    try {
      // Start the background task
      const startResponse = await axios.post(`${API}/questions/check-duplicates-ai-start/${selectedBatch}`, {
        model: aiModel
      });
      
      const taskId = startResponse.data.task_id;
      toast.info(`Búsqueda iniciada con ${modelLabel}...`, { duration: 3000 });
      
      // Poll for status
      const pollStatus = async () => {
        try {
          const statusResponse = await axios.get(`${API}/duplicates/status/${taskId}`);
          const status = statusResponse.data;
          
          // Update progress
          setDuplicateProgress({
            current: status.current || 0,
            total: status.total || 0,
            percentage: status.percentage || 0,
            duplicatesFound: status.duplicates_found || 0
          });
          
          if (status.status === "completed") {
            // Stop polling
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }
            
            setDuplicates(status.duplicates || []);
            setCheckingDuplicates(false);
            setDuplicateProgress({ current: 0, total: 0, percentage: 0, duplicatesFound: 0 });
            
            if (status.duplicates_count > 0) {
              setShowDuplicatesModal(true);
              toast.success(`${status.duplicates_count} duplicados encontrados con ${modelLabel}`);
            } else {
              toast.success(`No se encontraron duplicados con ${modelLabel}`);
            }
            
            fetchQuestions();
            
            // Cleanup the task from server memory
            axios.delete(`${API}/duplicates/status/${taskId}`).catch(() => {});
            
          } else if (status.status === "error") {
            // Stop polling on error
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }
            
            setCheckingDuplicates(false);
            setDuplicateProgress({ current: 0, total: 0, percentage: 0, duplicatesFound: 0 });
            toast.error(`Error: ${status.error || 'Error desconocido'}`);
            
            // Cleanup
            axios.delete(`${API}/duplicates/status/${taskId}`).catch(() => {});
          }
        } catch (pollError) {
          console.error("Error polling status:", pollError);
        }
      };
      
      // Start polling every 1.5 seconds
      pollingIntervalRef.current = setInterval(pollStatus, 1500);
      
      // Also poll immediately
      pollStatus();
      
    } catch (error) {
      console.error("Error starting AI duplicate check:", error);
      setCheckingDuplicates(false);
      setDuplicateProgress({ current: 0, total: 0, percentage: 0, duplicatesFound: 0 });
      toast.error("Error al iniciar la búsqueda de duplicados");
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
        // Fetch both questions with their batch info
        const [originalResponse, newQuestionResponse] = await Promise.all([
          axios.get(`${API}/questions/by-id/${question.duplicate_of}`).catch(err => {
            console.error("Error fetching original question:", err);
            return null;
          }),
          axios.get(`${API}/questions/by-id/${question.id}`).catch(err => {
            console.error("Error fetching new question:", err);
            return null;
          })
        ]);
        
        // Check if original question was found
        if (!originalResponse || !originalResponse.data || originalResponse.data.detail) {
          toast.error("La pregunta duplicada original fue eliminada. Limpiando referencia...");
          // Clear the duplicate flag since original no longer exists
          try {
            await axios.put(`${API}/questions/${question.id}`, {
              is_duplicate: false,
              duplicate_of: null
            });
          } catch (e) {
            console.error("Error clearing duplicate flag:", e);
          }
          fetchQuestions();
          return;
        }
        
        const originalQ = originalResponse.data;
        const newQ = newQuestionResponse?.data || question;
        
        setDuplicates([{
          new_question: {
            id: question.id,
            username: question.youtube_username,
            real_name: question.real_name,
            text: question.corrected_text || question.original_text,
            batch_id: newQ.import_batch_id || question.import_batch_id,
            batch_name: newQ.batch_name,
            batch_date: newQ.batch_date
          },
          original_question: {
            id: originalQ.id,
            username: originalQ.youtube_username,
            real_name: originalQ.real_name,
            text: originalQ.corrected_text || originalQ.original_text,
            batch_id: originalQ.import_batch_id,
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
          try {
            await axios.put(`${API}/questions/${question.id}`, {
              is_duplicate: false,
              duplicate_of: null
            });
          } catch (e) {
            console.error("Error clearing duplicate flag:", e);
          }
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
      const nextIsGreeting = !isGreetingQuestion(question);
      const payload = nextIsGreeting
        ? {
            is_greeting: true,
            clasificacion: "saludo",
            motivo_clasificacion: "Marcado manualmente como saludo"
          }
        : {
            is_greeting: false,
            clasificacion: "dudoso",
            motivo_clasificacion: "Desmarcado manualmente como saludo"
          };
      await axios.put(`${API}/questions/${question.id}`, {
        ...payload
      });
      setQuestions(prev => nextIsGreeting
        ? prev.filter(q => q.id !== question.id)
        : prev.map(q => q.id === question.id ? { ...q, ...payload } : q)
      );
      toast.success(nextIsGreeting ? "Marcado como saludo" : "Desmarcado como saludo");
    } catch (error) {
      console.error("Error updating question:", error);
    }
  };

  const handleUpdateQuestion = async (questionId, field, value) => {
    try {
      // When the user manually edits the real_name, mark it as confirmed so the app
      // knows it was reviewed (even if the value equals the youtube_username).
      const payload = { [field]: value };
      if (field === "real_name") {
        payload.real_name_confirmed = true;
      }
      await axios.put(`${API}/questions/${questionId}`, payload);
      setQuestions(prev => prev.map(q =>
        q.id === questionId
          ? { ...q, ...payload }
          : q
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

  const handleClasificarIA = async () => {
    if (!selectedBatch) return;
    setClasifying(true);
    setClasifyProgress({ current: 0, total: 0, percentage: 0 });
    
    try {
      const startResponse = await axios.post(`${API}/questions/clasificar/${selectedBatch}`);
      
      // Sync response path: no questions to classify
      if (!startResponse.data.task_id) {
        toast.info(startResponse.data.message || "Nada que clasificar");
        setClasifying(false);
        return;
      }
      
      const taskId = startResponse.data.task_id;
      const total = startResponse.data.total || 0;
      setClasifyProgress({ current: 0, total, percentage: 0 });
      toast.info(`Clasificando ${total} comentarios con IA...`, { duration: 2500 });
      
      const pollStatus = async () => {
        try {
          const statusRes = await axios.get(`${API}/questions/clasificar/status/${taskId}`);
          const s = statusRes.data;
          
          setClasifyProgress({
            current: s.current || 0,
            total: s.total || 0,
            percentage: s.percentage || 0
          });
          
          if (s.status === "completed") {
            if (clasifyPollRef.current) {
              clearInterval(clasifyPollRef.current);
              clasifyPollRef.current = null;
            }
            setClasifying(false);
            setClasifyProgress({ current: 0, total: 0, percentage: 0 });
            
            const counts = s.counts || {};
            toast.success(
              `${s.classified_count || 0} clasificadas · ${counts.pregunta || 0} preguntas, ${counts.dudoso || 0} dudosas, ${counts.saludo || 0} saludos`
            );
            
            await fetchQuestions();
            axios.delete(`${API}/questions/clasificar/status/${taskId}`).catch(() => {});
          } else if (s.status === "error") {
            if (clasifyPollRef.current) {
              clearInterval(clasifyPollRef.current);
              clasifyPollRef.current = null;
            }
            setClasifying(false);
            setClasifyProgress({ current: 0, total: 0, percentage: 0 });
            toast.error(`Error al clasificar: ${s.error || 'desconocido'}`);
            axios.delete(`${API}/questions/clasificar/status/${taskId}`).catch(() => {});
          }
        } catch (pollErr) {
          console.error("Error polling clasif status:", pollErr);
        }
      };
      
      // Kick off immediately, then every 1.5s
      pollStatus();
      clasifyPollRef.current = setInterval(pollStatus, 1500);
    } catch (error) {
      console.error("Error starting classification:", error);
      toast.error("Error al iniciar clasificación");
      setClasifying(false);
      setClasifyProgress({ current: 0, total: 0, percentage: 0 });
    }
  };

  const handleConfirmarComoPregunta = async (questionId) => {
    try {
      await axios.put(`${API}/questions/${questionId}`, {
        clasificacion: "pregunta",
        motivo_clasificacion: "Confirmado manualmente",
        is_greeting: false
      });
      setQuestions(prev => prev.map(q =>
        q.id === questionId
          ? { ...q, clasificacion: "pregunta", motivo_clasificacion: "Confirmado manualmente", is_greeting: false }
          : q
      ));
      toast.success("Confirmada como pregunta");
    } catch (error) {
      console.error("Error confirming as question:", error);
      toast.error("Error al confirmar");
    }
  };

  const handleBlockUser = async (question) => {
    const user = question.youtube_username || "";
    if (!window.confirm(
      `¿Bloquear a ${user}?\n\nSus comentarios similares se eliminarán automáticamente en esta y futuras importaciones.`
    )) return;
    
    try {
      const refText = question.corrected_text || question.original_text || "";
      await axios.post(`${API}/comentarios-bloqueados`, {
        youtube_username: user,
        texto_referencia: refText,
        motivo: "Bloqueado desde el editor"
      });
      await axios.delete(`${API}/questions/${question.id}`);
      setQuestions(prev => prev.filter(q => q.id !== question.id));
      toast.success(`${user} bloqueado — comentario eliminado`);
      fetchBatches();
    } catch (error) {
      console.error("Error blocking user:", error);
      toast.error("Error al bloquear");
    }
  };

  const handleConfirmName = async (questionId) => {
    try {
      await axios.post(`${API}/questions/${questionId}/confirm-name`);
      setQuestions(prev => prev.map(q =>
        q.id === questionId ? { ...q, real_name_confirmed: true } : q
      ));
      toast.success("Nombre confirmado");
    } catch (error) {
      console.error("Error confirming name:", error);
      toast.error("Error al confirmar nombre");
    }
  };

  const handleConfirmDerivedNames = async () => {
    if (!selectedBatch) return;
    try {
      const res = await axios.post(`${API}/questions/confirm-derived-names/${selectedBatch}`);
      const n = res.data.confirmed_count || 0;
      if (n > 0) {
        toast.success(`${n} nombres derivados confirmados`);
        await fetchQuestions();
      } else {
        toast.info("Ningún nombre coincidía con el @username");
      }
    } catch (error) {
      console.error("Error confirming derived names:", error);
      toast.error("Error al confirmar nombres derivados");
    }
  };

  const validQuestions = questions.filter(q => !isGreetingQuestion(q) && !q.is_duplicate);

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
        {/* 1. Clasificar con IA */}
        <Button
          variant="outline"
          onClick={handleClasificarIA}
          disabled={clasifying || questions.length === 0}
          size="lg"
          className="rounded-sm uppercase tracking-wide text-xs"
          data-testid="clasificar-ia-button"
        >
          {clasifying ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Filter className="w-4 h-4 mr-2" />
          )}
          {clasifying && clasifyProgress.total > 0
            ? `Clasificando ${clasifyProgress.percentage}%`
            : "Clasificar con IA"}
        </Button>

        {/* AI Classification Progress */}
        {clasifying && clasifyProgress.total > 0 && (
          <div className="flex-1 max-w-sm" data-testid="clasif-progress">
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${clasifyProgress.percentage}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>{clasifyProgress.current}/{clasifyProgress.total} comentarios</span>
              <span className="text-primary font-medium">{clasifyProgress.percentage}%</span>
            </div>
          </div>
        )}

        {/* 2. Duplicados (rápido) */}
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

        {/* 3. Buscar con IA (+ selector de modelo) */}
        <div className="flex items-center gap-2">
          <Select value={aiModel} onValueChange={setAiModel} disabled={checkingDuplicates}>
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
            {checkingDuplicates && duplicateProgress.total > 0 
              ? `${duplicateProgress.percentage}%` 
              : "Buscar con IA"
            }
          </Button>
        </div>
        
        {/* AI Duplicate Search Progress */}
        {checkingDuplicates && duplicateProgress.total > 0 && (
          <div className="flex-1 max-w-sm">
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${duplicateProgress.percentage}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>{duplicateProgress.current}/{duplicateProgress.total} preguntas</span>
              <span className="text-primary font-medium">
                {duplicateProgress.duplicatesFound > 0 && `${duplicateProgress.duplicatesFound} encontrados`}
              </span>
            </div>
          </div>
        )}

        {duplicates.length > 0 && !checkingDuplicates && (
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

        {/* 4. Corregir todo con IA */}
        <Button
          onClick={() => handleCorrectAll(false)}
          disabled={correcting || questions.length === 0}
          size="lg"
          className="rounded-sm uppercase tracking-wide text-xs min-w-[200px]"
          data-testid="correct-all-button"
        >
          {correcting && correctingMode === "correct" ? (
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

        <Button
          onClick={() => handleCorrectAll(true)}
          disabled={correcting || questions.length === 0}
          size="lg"
          variant="outline"
          className="rounded-sm uppercase tracking-wide text-xs min-w-[210px]"
          data-testid="recorrect-all-button"
        >
          {correcting && correctingMode === "recorrect" ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {correctingProgress.total > 0
                ? `Procesando ${correctingProgress.current}/${correctingProgress.total}...`
                : "Iniciando..."
              }
            </>
          ) : (
            <>
              <Wand2 className="w-4 h-4 mr-2" />
              Recorregir todo con IA
            </>
          )}
        </Button>
        
        {/* Progress bar for Correct All */}
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

        {/* 5. Actualizar nombres */}
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

        {/* 5b. Confirmar nombres derivados */}
        <Button
          variant="outline"
          onClick={handleConfirmDerivedNames}
          disabled={questions.length === 0}
          size="lg"
          className="rounded-sm uppercase tracking-wide text-xs"
          data-testid="confirm-derived-names-button"
        >
          <Check className="w-4 h-4 mr-2" />
          Confirmar nombres derivados
        </Button>

        {/* 6. Buscar en todo */}
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

        <div className="flex-1" />
        
        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span><strong>{validQuestions.length}</strong> válidas</span>
          </div>
          {(() => {
            const noNameCount = questions.filter(q => getNameState(q) === "missing").length;
            return noNameCount > 0 ? (
              <button
                onClick={() => {
                  setShowOnlyNoName(!showOnlyNoName);
                  if (!showOnlyNoName) setShowOnlyDuplicates(false);
                }}
                className={`flex items-center gap-2 px-3 py-1 rounded transition-colors cursor-pointer border ${
                  showOnlyNoName 
                    ? 'bg-yellow-500 text-white border-yellow-500' 
                    : 'hover:bg-yellow-50 border-yellow-400'
                }`}
                title={showOnlyNoName ? "Ver todas las preguntas" : "Filtrar solo sin nombre"}
              >
                <div className={`w-3 h-3 rounded-full ${showOnlyNoName ? 'bg-white' : 'bg-yellow-500'}`} />
                <span className={`font-medium ${showOnlyNoName ? '' : 'text-yellow-600'}`}>
                  <strong>{noNameCount}</strong> sin nombre
                </span>
              </button>
            ) : null;
          })()}
          {questions.filter(q => q.is_duplicate).length > 0 && (
            <button
              onClick={() => {
                setShowOnlyDuplicates(!showOnlyDuplicates);
                if (!showOnlyDuplicates) setShowOnlyNoName(false);
              }}
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

      {/* Ready-to-process counter */}
      {questions.some(q => q.clasificacion) && (
        <div
          className="mb-4 p-3 bg-green-50 border border-green-200 rounded-sm flex items-center gap-3"
          data-testid="ready-counter"
        >
          <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
          <p className="text-sm text-green-800">
            <span className="font-semibold">
              {questions.filter(q => q.clasificacion === "pregunta").length}
            </span>{" "}
            comentarios listos para procesar{" "}
            <span className="text-green-600">(solo preguntas confirmadas)</span>
          </p>
        </div>
      )}

      {/* Classification Filter Pills */}
      {questions.some(q => q.clasificacion) && (
        <div className="flex items-center gap-2 mb-6 flex-wrap" data-testid="clasificacion-filters">
          <span className="text-xs uppercase tracking-wide text-muted-foreground mr-2">Filtrar:</span>
          {(() => {
            const cCounts = questions.reduce((acc, q) => {
              if (q.clasificacion) acc[q.clasificacion] = (acc[q.clasificacion] || 0) + 1;
              return acc;
            }, {});
            const pills = [
              { value: "all", label: "Todas", count: questions.length, dot: "bg-foreground" },
              { value: "pregunta", label: "Preguntas", count: cCounts.pregunta || 0, dot: "bg-green-500" },
              { value: "dudoso", label: "Dudosas", count: cCounts.dudoso || 0, dot: "bg-yellow-500" },
            ];
            return pills.map(p => (
              <button
                key={p.value}
                onClick={() => {
                  setClasificationFilter(p.value);
                  // Classification pills take precedence — clear mutex filters
                  setShowOnlyDuplicates(false);
                  setShowOnlyNoName(false);
                }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-sm border text-xs transition-colors ${
                  clasificationFilter === p.value && !showOnlyDuplicates && !showOnlyNoName
                    ? 'bg-foreground text-background border-foreground'
                    : 'border-border hover:bg-secondary/50'
                }`}
                data-testid={`filter-pill-${p.value}`}
              >
                <div className={`w-2.5 h-2.5 rounded-full ${p.dot}`} />
                <span className="font-medium">{p.label}</span>
                <span className="opacity-70">({p.count})</span>
              </button>
            ));
          })()}
        </div>
      )}

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
          (() => {
            // Apply filters (uses centralized getNameState for consistency)
            let filteredQuestions = questions;
            if (showOnlyDuplicates) {
              filteredQuestions = questions.filter(q => q.is_duplicate);
            } else if (showOnlyNoName) {
              filteredQuestions = questions.filter(q => getNameState(q) === "missing");
            } else if (clasificationFilter !== "all" && questions.some(q => q.clasificacion)) {
              filteredQuestions = questions.filter(q => q.clasificacion === clasificationFilter);
            }
            
            return filteredQuestions.map((question, index) => (
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
                  
                  {!question.real_name_confirmed && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleConfirmName(question.id)}
                      className="h-6 px-2 rounded-sm text-xs text-green-700 hover:bg-green-50 hover:text-green-800 border border-green-200"
                      title="Confirmar que este nombre es correcto"
                      data-testid={`confirm-name-btn-${question.id}`}
                    >
                      <Check className="w-3 h-3 mr-1" />
                      Nombre
                    </Button>
                  )}
                  
                  <div className="flex gap-2 ml-auto flex-shrink-0">
                    {(() => {
                      const state = getNameState(question);
                      const styleMap = {
                        confirmed: {
                          cls: "text-green-700 border-green-500 bg-green-50",
                          label: "Nombre confirmado",
                          dot: "bg-green-500",
                          title: "Nombre real confirmado"
                        },
                        auto: {
                          cls: "text-yellow-700 border-yellow-500 bg-yellow-50 cursor-pointer hover:bg-yellow-100",
                          label: "Nombre auto",
                          dot: "bg-yellow-500",
                          title: "Nombre sustituido por la app — click para confirmar"
                        },
                        missing: {
                          cls: "text-red-700 border-red-500 bg-red-50 cursor-pointer hover:bg-red-100",
                          label: "Sin nombre",
                          dot: "bg-red-500",
                          title: "Sigue con @username — click para confirmar igualmente"
                        }
                      };
                      const s = styleMap[state];
                      const handleConfirm = async () => {
                        if (state === "confirmed") return;
                        if (!window.confirm(`¿Confirmar "${question.real_name || question.youtube_username}" como nombre correcto?`)) return;
                        try {
                          await axios.post(`${API}/questions/${question.id}/confirm-name`);
                          toast.success("Nombre confirmado");
                          fetchQuestions();
                        } catch {
                          toast.error("Error al confirmar nombre");
                        }
                      };
                      return (
                        <Badge
                          variant="outline"
                          className={`text-xs ${s.cls}`}
                          onClick={state !== "confirmed" ? handleConfirm : undefined}
                          title={s.title}
                          data-testid={`name-state-${state}-${question.id}`}
                        >
                          <div className={`w-2 h-2 rounded-full ${s.dot} mr-1.5`} />
                          {s.label}
                        </Badge>
                      );
                    })()}
                    {question.is_corrected && (
                      <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 border-green-300">
                        <Check className="w-3 h-3 mr-1" />
                        Corregido
                      </Badge>
                    )}
                    {question.clasificacion && (() => {
                      const cls = question.clasificacion;
                      const styles = cls === "pregunta"
                        ? "text-green-700 border-green-400 bg-green-50"
                        : cls === "dudoso"
                        ? "text-yellow-700 border-yellow-400 bg-yellow-50"
                        : "text-red-700 border-red-400 bg-red-50";
                      const dot = cls === "pregunta" ? "🟢" : cls === "dudoso" ? "🟡" : "🔴";
                      return (
                        <Badge
                          variant="outline"
                          className={`text-xs ${styles}`}
                          title={question.motivo_clasificacion || ""}
                          data-testid={`clasif-badge-${question.id}`}
                        >
                          <span className="mr-1">{dot}</span>
                          {cls === "pregunta" ? "Pregunta" : cls === "dudoso" ? "Dudoso" : "Saludo"}
                          {question.motivo_clasificacion && (
                            <span className="ml-1 opacity-70 font-normal normal-case">· {question.motivo_clasificacion}</span>
                          )}
                        </Badge>
                      );
                    })()}
                    {question.is_greeting && (
                      <Badge variant="outline" className="text-xs text-gray-600 border-gray-400 bg-gray-50">
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
                    <span className="ml-1.5 hidden sm:inline">
                      {question.is_corrected ? "Recorregir IA" : "Corregir IA"}
                    </span>
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
                  
                  {question.clasificacion && question.clasificacion !== "pregunta" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleConfirmarComoPregunta(question.id)}
                      className="rounded-sm text-xs text-green-700 border-green-400 hover:bg-green-50"
                      data-testid={`confirm-as-question-btn-${question.id}`}
                      title="Reclasificar como pregunta"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span className="ml-1.5 hidden sm:inline">Es pregunta</span>
                    </Button>
                  )}
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleToggleGreeting(question)}
                    className={`rounded-sm text-xs ${
                      isGreetingQuestion(question)
                        ? "text-yellow-700 border-yellow-500 bg-yellow-50" 
                        : "text-muted-foreground"
                    }`}
                    data-testid={`greeting-btn-${question.id}`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span className="ml-1.5 hidden sm:inline">
                      {isGreetingQuestion(question) ? "Es saludo" : "Saludo"}
                    </span>
                  </Button>
                  
                  <div className="flex-1" />
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleBlockUser(question)}
                    className="rounded-sm text-xs text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                    data-testid={`block-user-btn-${question.id}`}
                    title="Añadir este usuario a la lista negra — sus comentarios similares se eliminarán siempre"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    <span className="ml-1.5 hidden sm:inline">Bloquear usuario</span>
                  </Button>
                  
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
          ));
          })()
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
