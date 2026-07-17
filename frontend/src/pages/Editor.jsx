import { useCallback, useEffect, useState, useRef } from "react";
import { useLocation } from "react-router-dom";
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
  Ban,
  Video,
  Inbox,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  RefreshCw
} from "lucide-react";
import { API_BASE_URL as API } from "@/lib/api";
import { useUndo } from "@/contexts/UndoContext";

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

const workflowModeConfig = {
  classify: {
    title: "CLASIFICAR",
    subtitle: "Separa saludos, comentarios dudosos y preguntas reales",
  },
  review_doubtful: {
    title: "REVISAR DUDOSAS",
    subtitle: "Confirma manualmente qué comentarios dudosos son preguntas",
  },
  names: {
    title: "NOMBRES",
    subtitle: "Actualiza y revisa solo nombres no confirmados",
  },
  confirm_names: {
    title: "CONFIRMAR NOMBRES",
    subtitle: "Valida nombres derivados antes de continuar",
  },
  duplicates_fast: {
    title: "DUPLICADOS RÁPIDO",
    subtitle: "Busca coincidencias exactas o muy directas",
  },
  duplicates_ai: {
    title: "DUPLICADOS IA",
    subtitle: "Busca coincidencias semánticas entre preguntas",
  },
  review_duplicates: {
    title: "REVISAR DUPLICADOS",
    subtitle: "Compara pares y decide qué conservar",
  },
  spelling: {
    title: "ORTOGRAFÍA",
    subtitle: "Corrige las preguntas finales antes de distribuir",
  },
  reserve: {
    title: "RESERVA",
    subtitle: "Revisa preguntas pendientes e inclúyelas manualmente si procede",
  },
};

const normalizeYoutubeUsername = (username) => (
  (username || "").replace(/^@+/, "").trim().toLowerCase()
);

const getYoutubeVideoUrl = (videoId) => (
  videoId ? `https://www.youtube.com/watch?v=${videoId}` : null
);

const copyVideoSource = async (question) => {
  const videoTitle = question.youtube_video_title || "Video de YouTube";
  const videoUrl = getYoutubeVideoUrl(question.youtube_video_id);
  const value = videoUrl ? `${videoTitle}\n${videoUrl}` : videoTitle;

  try {
    await navigator.clipboard.writeText(value);
    toast.success("Origen del video copiado");
  } catch (error) {
    console.error("Error copying video source:", error);
    toast.error("No se pudo copiar el origen");
  }
};

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
      className={`flex items-center gap-1.5 px-2 py-1 rounded transition-colors group flex-shrink-0 ${
        question.real_name_confirmed
          ? "bg-green-50 text-green-800 border border-green-200 hover:bg-green-100"
          : "hover:bg-secondary/50"
      }`}
      data-testid={`name-edit-button-${question.id}`}
    >
      <span className="font-medium text-sm">
        {question.real_name || "Sin nombre"}
      </span>
      <Pencil className={`w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity ${
        question.real_name_confirmed ? "text-green-700" : "text-muted-foreground"
      }`} />
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
      className={`font-mono text-xs px-2 py-1 rounded flex-shrink-0 transition-colors group flex items-center gap-1 ${
        question.real_name_confirmed
          ? "bg-green-50 text-green-800 border border-green-200 hover:bg-green-100"
          : "bg-secondary/50 text-muted-foreground hover:bg-secondary"
      }`}
      title={question.real_name_confirmed ? "Usuario con nombre confirmado" : "Click para editar username"}
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

const formatDuplicateDate = (value) => {
  if (!value) return "Fecha no disponible";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return date.toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const DuplicateQuestionPanel = ({ question, label, tone, onDelete, deleting, busy }) => {
  const videoUrl = getYoutubeVideoUrl(question.video_id);
  const toneClasses = tone === "original"
    ? "border-sky-300 bg-sky-50/40 dark:bg-sky-950/20"
    : "border-amber-300 bg-amber-50/40 dark:bg-amber-950/20";
  const badgeClasses = tone === "original"
    ? "border-sky-300 bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-200"
    : "border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200";

  return (
    <section className={`flex min-h-[390px] min-w-0 flex-col border-2 p-5 ${toneClasses}`}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2 border-b border-current/10 pb-4">
        <Badge variant="outline" className={`rounded-sm text-xs font-bold ${badgeClasses}`}>
          {label}
        </Badge>
        <span className="text-xs text-muted-foreground">{question.batch_name || "Lote desconocido"}</span>
      </div>

      <div className="mb-5 space-y-3 text-sm">
        <div>
          <p className="font-semibold text-base">{question.real_name || question.username || "Usuario desconocido"}</p>
          {question.username && (
            <p className="font-mono text-xs text-muted-foreground">{question.username}</p>
          )}
        </div>
        <div className="flex items-start gap-2 text-muted-foreground">
          <CalendarDays className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>
            <p className="text-xs font-semibold uppercase">Importada el</p>
            <p>{formatDuplicateDate(question.created_at)}</p>
          </div>
        </div>
        {question.video_title && (
          <div className="flex items-start gap-2 text-muted-foreground">
            <Video className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div className="min-w-0">
              <p className="break-words">{question.video_title}</p>
              {videoUrl && (
                <a
                  href={videoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-xs text-primary underline-offset-4 hover:underline"
                >
                  Ver vídeo <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 border-y border-border bg-background/70 p-4">
        <p className="whitespace-pre-wrap text-base leading-relaxed">{question.text}</p>
      </div>

      <Button
        variant="outline"
        size="lg"
        onClick={onDelete}
        disabled={busy}
        className="mt-5 rounded-sm border-destructive/50 text-xs uppercase text-destructive hover:bg-destructive hover:text-destructive-foreground"
      >
        {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
        Eliminar {tone === "original" ? "original" : "duplicada"}
      </Button>
    </section>
  );
};

const DuplicateReview = ({ duplicates, loading, onDelete, onKeep, onRefresh, focusQuestionId }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [decision, setDecision] = useState(null);

  useEffect(() => {
    if (!focusQuestionId) return;
    const focusIndex = duplicates.findIndex((pair) => (
      pair.new_question.id === focusQuestionId || pair.original_question.id === focusQuestionId
    ));
    if (focusIndex >= 0) setActiveIndex(focusIndex);
  }, [duplicates, focusQuestionId]);

  useEffect(() => {
    if (!duplicates || duplicates.length === 0) {
      setActiveIndex(0);
      return;
    }
    setActiveIndex((current) => Math.min(current, duplicates.length - 1));
  }, [duplicates]);

  if (loading) {
    return (
      <div className="border border-border bg-card py-20 text-center">
        <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin" />
        <p className="text-muted-foreground">Cargando comparaciones pendientes...</p>
      </div>
    );
  }

  if (!duplicates || duplicates.length === 0) {
    return (
      <div className="border border-green-300 bg-green-50 px-6 py-16 text-center dark:bg-green-950/20">
        <CheckCircle className="mx-auto mb-4 h-10 w-10 text-green-600" />
        <h2 className="font-heading text-2xl">REVISIÓN COMPLETADA</h2>
        <p className="mt-2 text-sm text-muted-foreground">No quedan parejas de duplicados pendientes en este lote.</p>
        <Button variant="outline" onClick={onRefresh} className="mt-5 rounded-sm">
          <RefreshCw className="mr-2 h-4 w-4" />
          Comprobar de nuevo
        </Button>
      </div>
    );
  }

  const activeDuplicate = duplicates[activeIndex] || duplicates[0];
  const isFirstDuplicate = activeIndex === 0;
  const isLastDuplicate = activeIndex >= duplicates.length - 1;

  const runDecision = async (key, action) => {
    setDecision(key);
    try {
      await action();
    } finally {
      setDecision(null);
    }
  };

  const handleDiscardDuplicate = () => runDecision("duplicate", async () => {
    await onDelete(activeDuplicate.new_question.id);
  });

  const handleDiscardOriginal = () => runDecision("original", async () => {
    if (!window.confirm("¿Seguro que quieres eliminar la pregunta anterior y conservar la nueva?")) {
      return;
    }
    await onDelete(activeDuplicate.original_question.id);
  });

  const handleKeepBoth = () => runDecision("both", async () => {
    await onKeep(activeDuplicate.new_question.id);
  });

  const handleDeleteBoth = () => runDecision("delete-both", async () => {
    if (!window.confirm("¿Seguro que quieres eliminar ambas preguntas? Esta acción puede quitar una pregunta antigua.")) {
      return;
    }
    await onDelete(activeDuplicate.new_question.id);
    await onDelete(activeDuplicate.original_question.id);
  });

  return (
    <div className="border border-border bg-card p-4 sm:p-6" data-testid="duplicate-review">
      <div className="mb-6 flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Copy className="h-6 w-6 text-destructive" />
            <h2 className="font-heading text-2xl">COMPARAR DUPLICADOS</h2>
            <Badge variant="destructive" className="rounded-sm">{duplicates.length}</Badge>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Compara una pareja cada vez y decide qué preguntas deben continuar.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setActiveIndex((current) => Math.max(0, current - 1))}
            disabled={isFirstDuplicate || Boolean(decision)}
            title="Comparación anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[110px] text-center text-sm font-semibold">
            {activeIndex + 1} de {duplicates.length}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setActiveIndex((current) => Math.min(duplicates.length - 1, current + 1))}
            disabled={isLastDuplicate || Boolean(decision)}
            title="Comparación siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_48px_minmax(0,1fr)]">
        <DuplicateQuestionPanel
          question={activeDuplicate.original_question}
          label="ORIGINAL"
          tone="original"
          onDelete={handleDiscardOriginal}
          deleting={decision === "original"}
          busy={Boolean(decision)}
        />

        <div className="relative flex items-center justify-center" aria-hidden="true">
          <div className="hidden h-full w-px bg-border lg:block" />
          <span className="absolute bg-card px-2 text-xs font-bold text-muted-foreground">VS</span>
        </div>

        <DuplicateQuestionPanel
          question={activeDuplicate.new_question}
          label="POSIBLE DUPLICADA"
          tone="duplicate"
          onDelete={handleDiscardDuplicate}
          deleting={decision === "duplicate"}
          busy={Boolean(decision)}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 border-t border-dashed border-border pt-5 sm:grid-cols-2">
        <Button
          size="lg"
          onClick={handleKeepBoth}
          disabled={Boolean(decision)}
          className="rounded-sm bg-green-600 text-xs uppercase hover:bg-green-700"
        >
          {decision === "both" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
          No son duplicadas: conservar las dos
        </Button>
        <Button
          variant="destructive"
          size="lg"
          onClick={handleDeleteBoth}
          disabled={Boolean(decision)}
          className="rounded-sm text-xs uppercase"
        >
          {decision === "delete-both" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
          Eliminar las dos
        </Button>
      </div>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        Al decidir, esta pareja desaparece y se muestra automáticamente la siguiente.
      </p>
    </div>
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

export default function Editor({ workflowMode = null }) {
  const location = useLocation();
  const undoScope = location.pathname;
  const { pushUndo, registerUndoHandler, setActiveScope } = useUndo();
  const workflowConfig = workflowMode ? workflowModeConfig[workflowMode] : null;
  const isFocusedWorkflow = Boolean(workflowConfig);
  const [batches, setBatches] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState("");
  const [questions, setQuestions] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [globalReserveMode, setGlobalReserveMode] = useState(() => (
    typeof window !== "undefined" && sessionStorage.getItem('editorGlobalReserve') === 'true'
  ));
  const [loading, setLoading] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [correctingMode, setCorrectingMode] = useState(null);
  const [correctingProgress, setCorrectingProgress] = useState({ current: 0, total: 0 });
  const [correctingId, setCorrectingId] = useState(null);
  const [movingQuestionId, setMovingQuestionId] = useState(null);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [duplicateProgress, setDuplicateProgress] = useState({ current: 0, total: 0, percentage: 0, duplicatesFound: 0 });
  const [duplicates, setDuplicates] = useState([]);
  const [loadingDuplicatePairs, setLoadingDuplicatePairs] = useState(false);
  const [duplicateFocusId, setDuplicateFocusId] = useState(null);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showOnlyDuplicates, setShowOnlyDuplicates] = useState(false);
  const [showOnlyNoName, setShowOnlyNoName] = useState(false);
  const [showOnlyUnconfirmedNames, setShowOnlyUnconfirmedNames] = useState(false);
  const [assignmentFilter, setAssignmentFilter] = useState(() => (
    typeof window !== "undefined"
      ? sessionStorage.getItem('editorAssignmentFilter') || "all"
      : "all"
  )); // "all" | "included" | "reserve" | "unassigned"
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

  useEffect(() => {
    sessionStorage.removeItem('editorGlobalReserve');
    sessionStorage.removeItem('editorAssignmentFilter');
  }, []);

  const fetchBatches = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/batches`);
      setBatches(response.data);

      // Check if there's a selected batch from Dashboard (only on first load)
      if (!initialBatchLoaded.current) {
        initialBatchLoaded.current = true;
        const storedBatch = sessionStorage.getItem('selectedBatch');
        if (globalReserveMode) {
          return;
        }

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
  }, [globalReserveMode]);

  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    try {
      const response = globalReserveMode
        ? await axios.get(`${API}/questions/reserve`)
        : await axios.get(`${API}/questions`, {
            params: { batch_id: selectedBatch, include_program_assignments: true }
          });
      setQuestions(response.data);
    } catch (error) {
      console.error("Error fetching questions:", error);
    } finally {
      setLoading(false);
    }
  }, [selectedBatch, globalReserveMode]);

  const fetchDuplicatePairs = useCallback(async () => {
    if (!selectedBatch || globalReserveMode) {
      setDuplicates([]);
      return [];
    }

    setLoadingDuplicatePairs(true);
    try {
      const response = await axios.get(`${API}/questions/duplicate-pairs/${selectedBatch}`);
      const pairs = response.data.duplicates || [];
      setDuplicates(pairs);
      if (response.data.orphans_count > 0) {
        toast.warning(`${response.data.orphans_count} referencia${response.data.orphans_count === 1 ? "" : "s"} de duplicado sin original`);
      }
      return pairs;
    } catch (error) {
      console.error("Error fetching duplicate pairs:", error);
      toast.error("No se pudieron cargar las comparaciones de duplicados");
      return [];
    } finally {
      setLoadingDuplicatePairs(false);
    }
  }, [selectedBatch, globalReserveMode]);

  const fetchPrograms = useCallback(async () => {
    if (!selectedBatch && !globalReserveMode) {
      setPrograms([]);
      return;
    }

    try {
      const response = await axios.get(`${API}/programs`, {
        params: globalReserveMode ? {} : { batch_id: selectedBatch }
      });
      setPrograms(response.data);
    } catch (error) {
      console.error("Error fetching programs:", error);
      setPrograms([]);
    }
  }, [selectedBatch, globalReserveMode]);

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  useEffect(() => {
    if (selectedBatch || globalReserveMode) {
      fetchPrograms();
      fetchQuestions();
    }
  }, [selectedBatch, globalReserveMode, fetchPrograms, fetchQuestions]);

  const handleSelectBatch = (batchId) => {
    setGlobalReserveMode(false);
    setAssignmentFilter("all");
    setShowOnlyUnconfirmedNames(false);
    setDuplicates([]);
    setDuplicateFocusId(null);
    setSelectedBatch(batchId);
  };

  const handleOpenGlobalReserve = () => {
    setSelectedBatch("");
    setGlobalReserveMode(true);
    setAssignmentFilter("reserve");
    setClasificationFilter("pregunta");
    setShowOnlyDuplicates(false);
    setShowOnlyNoName(false);
    setShowOnlyUnconfirmedNames(false);
  };

  useEffect(() => {
    const handleWorkflowStep = (event) => {
      const detail = event.detail || {};
      if (detail.path !== "/editor" && !detail.path?.startsWith("/flujo/")) return;

      if (detail.reserve) {
        handleOpenGlobalReserve();
        return;
      }

      if (globalReserveMode) {
        const fallbackBatch = selectedBatch || batches[0]?.id || "";
        setGlobalReserveMode(false);
        setAssignmentFilter("all");
        setShowOnlyDuplicates(false);
        setShowOnlyNoName(false);
        setShowOnlyUnconfirmedNames(false);
        if (fallbackBatch) {
          setSelectedBatch(fallbackBatch);
        }
      }

      if (detail.key === "names" || detail.key === "confirm_names") {
        setAssignmentFilter("all");
        setClasificationFilter("all");
        setShowOnlyDuplicates(false);
        setShowOnlyNoName(false);
        setShowOnlyUnconfirmedNames(true);
      }

      if (detail.key === "review_doubtful") {
        setAssignmentFilter("all");
        setClasificationFilter("dudoso");
        setShowOnlyDuplicates(false);
        setShowOnlyNoName(false);
        setShowOnlyUnconfirmedNames(false);
      }

      if (detail.key === "review_duplicates") {
        setShowOnlyNoName(false);
        setShowOnlyUnconfirmedNames(false);
        setShowOnlyDuplicates(true);
      }
    };

    window.addEventListener("spm-workflow-step", handleWorkflowStep);
    return () => window.removeEventListener("spm-workflow-step", handleWorkflowStep);
  }, [batches, globalReserveMode, selectedBatch]);

  useEffect(() => {
    if (!workflowMode) return;

    if (workflowMode === "reserve") {
      if (!globalReserveMode) {
        handleOpenGlobalReserve();
      }
      return;
    }

    if (globalReserveMode) {
      const fallbackBatch = selectedBatch || batches[0]?.id || "";
      setGlobalReserveMode(false);
      setAssignmentFilter("all");
      if (fallbackBatch) {
        setSelectedBatch(fallbackBatch);
      }
    }

    if (workflowMode === "review_doubtful") {
      setAssignmentFilter("all");
      setClasificationFilter("dudoso");
      setShowOnlyDuplicates(false);
      setShowOnlyNoName(false);
      setShowOnlyUnconfirmedNames(false);
      return;
    }

    if (workflowMode === "names" || workflowMode === "confirm_names") {
      setAssignmentFilter("all");
      setClasificationFilter("all");
      setShowOnlyDuplicates(false);
      setShowOnlyNoName(false);
      setShowOnlyUnconfirmedNames(true);
      return;
    }

    if (workflowMode === "review_duplicates") {
      setAssignmentFilter("all");
      setClasificationFilter("all");
      setShowOnlyNoName(false);
      setShowOnlyUnconfirmedNames(false);
      setShowOnlyDuplicates(true);
      return;
    }

    setAssignmentFilter("all");
    setClasificationFilter("all");
    setShowOnlyDuplicates(false);
    setShowOnlyNoName(false);
    setShowOnlyUnconfirmedNames(false);
  }, [workflowMode, batches, globalReserveMode, selectedBatch]);

  const duplicateReviewActive = workflowMode === "review_duplicates" || showOnlyDuplicates;

  useEffect(() => {
    if (duplicateReviewActive && selectedBatch && !globalReserveMode) {
      fetchDuplicatePairs();
    }
  }, [duplicateReviewActive, selectedBatch, globalReserveMode, fetchDuplicatePairs]);

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
    const question = questions.find(q => q.id === questionId);
    setCorrectingId(questionId);
    try {
      await axios.post(`${API}/questions/correct`, {
        question_ids: [questionId]
      });
      pushQuestionUndo("Corregir pregunta", question ? createQuestionSnapshot(question) : null);
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
      if (response.data.duplicates.length > 0) {
        if (duplicateReviewActive) {
          await fetchDuplicatePairs();
        } else {
          setShowOnlyDuplicates(true);
        }
        toast.info(`${response.data.duplicates_count} duplicados encontrados`);
      } else {
        setDuplicates([]);
        toast.success("No se encontraron duplicados");
      }
      await fetchQuestions();
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

            setCheckingDuplicates(false);
            setDuplicateProgress({ current: 0, total: 0, percentage: 0, duplicatesFound: 0 });

            if (status.duplicates_count > 0) {
              if (duplicateReviewActive) {
                await fetchDuplicatePairs();
              } else {
                setShowOnlyDuplicates(true);
              }
              toast.success(`${status.duplicates_count} duplicados encontrados con ${modelLabel}`);
            } else {
              setDuplicates([]);
              toast.success(`No se encontraron duplicados con ${modelLabel}`);
            }

            await fetchQuestions();

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
    if (question.duplicate_of) {
      setDuplicateFocusId(question.id);
      setShowOnlyDuplicates(true);
    } else {
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
      pushQuestionUndo(
        nextIsGreeting ? "Marcar como saludo" : "Desmarcar saludo",
        createQuestionSnapshot(question)
      );
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
    const targetQuestion = questions.find(q => q.id === questionId);
    const targetUsername = normalizeYoutubeUsername(targetQuestion?.youtube_username);
    const isNameUpdate = field === "real_name";
    const affectedQuestions = isNameUpdate && targetUsername
      ? questions.filter(q => normalizeYoutubeUsername(q.youtube_username) === targetUsername)
      : targetQuestion
      ? [targetQuestion]
      : [];
    const snapshots = affectedQuestions.map(createQuestionSnapshot);

    const payload = { [field]: value };
    if (isNameUpdate) {
      payload.real_name_confirmed = true;
      setQuestions(prev => prev.map(q =>
        normalizeYoutubeUsername(q.youtube_username) === targetUsername
          ? { ...q, ...payload }
          : q
      ));
    }

    try {
      // When the user manually edits the real_name, mark it as confirmed so the app
      // knows it was reviewed (even if the value equals the youtube_username).
      if (isNameUpdate) {
        payload.real_name_confirmed = true;
      }
      await axios.put(`${API}/questions/${questionId}`, payload);
      pushQuestionUndo(
        isNameUpdate ? "Editar nombre" : field === "corrected_text" ? "Editar texto corregido" : "Editar pregunta",
        snapshots
      );
      if (isNameUpdate) {
        toast.success(`Nombre actualizado en ${affectedQuestions.length} pregunta${affectedQuestions.length === 1 ? "" : "s"} visibles`);
        fetchQuestions();
      } else {
        setQuestions(prev => prev.map(q =>
          q.id === questionId ? { ...q, ...payload } : q
        ));
      }
    } catch (error) {
      if (isNameUpdate && snapshots.length > 0) {
        setQuestions(prev => prev.map(q => {
          const snapshot = snapshots.find(item => item.id === q.id);
          return snapshot ? { ...q, ...snapshot } : q;
        }));
      }
      console.error("Error updating question:", error);
      toast.error("Error al guardar");
    }
  };

  const handleDeleteQuestion = async (questionId) => {
    const scrollY = window.scrollY;
    try {
      await axios.delete(`${API}/questions/${questionId}`);
      setQuestions(prev => prev
        .filter(q => q.id !== questionId)
        .map(q => q.duplicate_of === questionId
          ? { ...q, is_duplicate: false, duplicate_of: null }
          : q
        ));
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
      const question = questions.find(q => q.id === questionId);
      await axios.put(`${API}/questions/${questionId}/clear-duplicate`);
      pushQuestionUndo("Mantener duplicado", question ? createQuestionSnapshot(question) : null);
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
      pushQuestionUndo("Aceptar pregunta", createQuestionSnapshot(question));
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
      const question = questions.find(q => q.id === questionId);
      await axios.put(`${API}/questions/${questionId}`, {
        clasificacion: "pregunta",
        motivo_clasificacion: "Confirmado manualmente",
        is_greeting: false
      });
      pushQuestionUndo("Confirmar como pregunta", question ? createQuestionSnapshot(question) : null);
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
      const question = questions.find(q => q.id === questionId);
      await axios.post(`${API}/questions/${questionId}/confirm-name`);
      pushQuestionUndo("Confirmar nombre", question ? createQuestionSnapshot(question) : null);
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

  const reserveProgramIds = new Set(programs.filter(p => p.is_reserve).map(p => p.id));
  const programById = new Map(programs.map(p => [p.id, p]));
  const normalPrograms = programs
    .filter(p => !p.is_reserve)
    .sort((a, b) => (a.question_count || 0) - (b.question_count || 0));
  const getCandidatePrograms = (question) => (
    normalPrograms.filter(program => (
      !globalReserveMode || program.batch_id === question.import_batch_id
    ))
  );
  const getAssignmentState = (question) => {
    if (!question.program_id) return "unassigned";
    return reserveProgramIds.has(question.program_id) ? "reserve" : "included";
  };
  const includedCount = questions.filter(q => getAssignmentState(q) === "included").length;
  const reserveCount = questions.filter(q => getAssignmentState(q) === "reserve").length;
  const unassignedCount = questions.filter(q => getAssignmentState(q) === "unassigned").length;
  const ownBatchQuestions = globalReserveMode
    ? questions
    : questions.filter(q => q.import_batch_id === selectedBatch);
  const visibleConfirmedCount = questions.filter(q =>
    q.clasificacion === "pregunta" && !q.is_duplicate && !isGreetingQuestion(q)
  ).length;
  const ownConfirmedCount = ownBatchQuestions.filter(q =>
    q.clasificacion === "pregunta" && !q.is_duplicate && !isGreetingQuestion(q)
  ).length;
  const externalVisibleCount = globalReserveMode
    ? 0
    : questions.filter(q => q.import_batch_id && q.import_batch_id !== selectedBatch).length;
  const unclassifiedVisibleCount = questions.filter(q => !q.clasificacion).length;
  const distributableQuestions = questions.filter(q =>
    q.clasificacion === "pregunta" && !q.is_duplicate && !isGreetingQuestion(q)
  );

  const createQuestionSnapshot = (question) => ({
    id: question.id,
    youtube_username: question.youtube_username,
    youtube_comment_id: question.youtube_comment_id,
    youtube_video_id: question.youtube_video_id,
    youtube_video_title: question.youtube_video_title,
    real_name: question.real_name,
    real_name_confirmed: question.real_name_confirmed,
    original_text: question.original_text,
    corrected_text: question.corrected_text,
    is_corrected: question.is_corrected,
    is_greeting: question.is_greeting,
    is_duplicate: question.is_duplicate,
    duplicate_of: question.duplicate_of,
    program_id: question.program_id,
    program_number: question.program_number,
    order_in_program: question.order_in_program,
    clasificacion: question.clasificacion,
    motivo_clasificacion: question.motivo_clasificacion,
  });

  const pushQuestionUndo = (label, snapshots) => {
    const normalizedSnapshots = (Array.isArray(snapshots) ? snapshots : [snapshots]).filter(Boolean);
    if (normalizedSnapshots.length === 0) return;
    pushUndo(undoScope, {
      type: "question_snapshot",
      label,
      snapshots: normalizedSnapshots,
    });
  };

  const handleIncludeReserveQuestion = async (question) => {
    const candidatePrograms = getCandidatePrograms(question);

    if (candidatePrograms.length === 0) {
      toast.error("No hay programas creados para incluir esta pregunta");
      return;
    }
    if (question.clasificacion !== "pregunta") {
      toast.error("Solo puedes incluir preguntas confirmadas");
      return;
    }
    if (question.is_duplicate || isGreetingQuestion(question)) {
      toast.error("No puedes incluir duplicados ni saludos");
      return;
    }

    const questionPreview = (question.corrected_text || question.original_text || "").trim();
    const confirmed = window.confirm(
      `¿Añadir esta pregunta de Reserva a la lista de preguntas que se van a editar?\n\n${questionPreview.slice(0, 180)}${questionPreview.length > 180 ? "..." : ""}`
    );
    if (!confirmed) {
      return;
    }

    const questionId = question.id;
    setMovingQuestionId(questionId);
    let lastError = null;

    try {
      for (const program of candidatePrograms) {
        try {
          const response = await axios.post(`${API}/questions/${questionId}/move`, {
            target_program_id: program.id
          });
          pushUndo(undoScope, {
            type: "move",
            questionId,
            questionLabel: question.real_name || question.youtube_username || "Pregunta",
            fromProgramId: question.program_id,
            fromProgramName: programById.get(question.program_id)?.name || "Reserva",
            toProgramName: response.data.target_program || program.name,
          });
          await Promise.all([fetchPrograms(), fetchQuestions()]);
          toast.success(`Pregunta añadida a la edición en curso (${response.data.target_program || program.name})`);
          return;
        } catch (error) {
          lastError = error;
          if (error.response?.status !== 400) {
            throw error;
          }
        }
      }

      toast.error(lastError?.response?.data?.detail || "No se pudo incluir en ningún programa");
    } catch (error) {
      console.error("Error including reserve question:", error);
      toast.error(error.response?.data?.detail || "Error al incluir la pregunta");
    } finally {
      setMovingQuestionId(null);
    }
  };

  const handleUndoAction = useCallback(async (action) => {
    if (!action) {
      return false;
    }

    try {
      if (action.type === "move") {
        if (!action.fromProgramId) return false;
        await axios.post(`${API}/questions/${action.questionId}/move`, {
          target_program_id: action.fromProgramId
        });
      } else if (action.type === "question_snapshot") {
        await Promise.all(action.snapshots.map(snapshot => (
          axios.put(`${API}/questions/${snapshot.id}`, snapshot)
        )));
      } else {
        return false;
      }
      await Promise.all([fetchPrograms(), fetchQuestions()]);
      toast.success(action.type === "move"
        ? `Deshecho: pregunta devuelta a ${action.fromProgramName}`
        : `Deshecho: ${action.label}`
      );
      return true;
    } catch (error) {
      console.error("Error undoing last action:", error);
      toast.error(error.response?.data?.detail || "No se pudo deshacer la última acción");
      return false;
    }
  }, [fetchPrograms, fetchQuestions]);

  useEffect(() => {
    setActiveScope(undoScope);
    const unregister = registerUndoHandler(undoScope, handleUndoAction);
    return () => {
      unregister();
      setActiveScope(null);
    };
  }, [handleUndoAction, registerUndoHandler, setActiveScope, undoScope]);

  const showAllActions = !isFocusedWorkflow;
  const showNameActions = showAllActions || workflowMode === "names";
  const showConfirmNameActions = showAllActions || workflowMode === "confirm_names";
  const showClassifyActions = showAllActions || workflowMode === "classify";
  const showFastDuplicateActions = showAllActions || workflowMode === "duplicates_fast";
  const showAiDuplicateActions = showAllActions || workflowMode === "duplicates_ai";
  const showReviewDuplicateActions = showAllActions || workflowMode === "review_duplicates";
  const showSpellingActions = showAllActions || workflowMode === "spelling";
  const showReserveActions = showAllActions || workflowMode === "reserve";

  return (
    <div className="p-6 md:p-10 animate-fade-in">
      {/* Header */}
      <div className="mb-8 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="font-heading text-4xl sm:text-5xl font-bold tracking-tight mb-2">
            {workflowConfig?.title || "EDITOR"}
          </h1>
          <p className="text-muted-foreground">
            {workflowConfig?.subtitle || "Revisa, corrige y filtra las preguntas importadas"}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Select value={selectedBatch} onValueChange={handleSelectBatch}>
            <SelectTrigger className="w-56 rounded-sm" data-testid="batch-selector">
              <SelectValue placeholder={globalReserveMode ? "Reserva global" : "Seleccionar lote"} />
            </SelectTrigger>
            <SelectContent>
              {batches.map((batch) => (
                <SelectItem key={batch.id} value={batch.id}>
                  {batch.name || new Date(batch.created_at).toLocaleDateString('es-ES')} ({batch.question_count} preguntas)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {globalReserveMode && (
        <div className="mb-6 p-4 border border-amber-300 bg-amber-50 text-amber-800 rounded-sm flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Reserva global</p>
            <p className="text-xs">Mostrando preguntas en Reserva de todos los lotes.</p>
          </div>
          {batches.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSelectBatch(batches[0].id)}
              className="rounded-sm text-xs border-amber-400 text-amber-800 hover:bg-amber-100"
            >
              Ver lote reciente
            </Button>
          )}
        </div>
      )}

      {/* Actions Bar */}
      <div className="flex flex-wrap items-center gap-4 mb-8 p-5 bg-card border border-border rounded-sm">
        {showNameActions && (
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
        )}

        {showConfirmNameActions && (
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
        )}

        {/* 2. Clasificar con IA */}
        {showClassifyActions && (
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
        )}

        {/* AI Classification Progress */}
        {showClassifyActions && clasifying && clasifyProgress.total > 0 && (
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

        {/* 3. Duplicados (rápido) */}
        {showFastDuplicateActions && (
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
        )}

        {/* 4. Buscar duplicados con IA (+ selector de modelo) */}
        {showAiDuplicateActions && (
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
        )}

        {/* AI Duplicate Search Progress */}
        {showAiDuplicateActions && checkingDuplicates && duplicateProgress.total > 0 && (
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

        {showReviewDuplicateActions && !checkingDuplicates && (
          <Button
            variant="secondary"
            onClick={() => {
              setShowOnlyDuplicates(true);
              fetchDuplicatePairs();
            }}
            disabled={loadingDuplicatePairs || !selectedBatch}
            size="lg"
            className="rounded-sm uppercase tracking-wide text-xs"
            data-testid="review-duplicates-button"
          >
            {loadingDuplicatePairs ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            {duplicates.length} parejas pendientes
          </Button>
        )}

        {/* 5. Corregir todo con IA */}
        {showSpellingActions && (
          <>
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
          </>
        )}

        {/* Progress bar for Correct All */}
        {showSpellingActions && correcting && correctingProgress.total > 0 && (
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

        {/* 6. Reserva */}
        {showReserveActions && (
          <Button
            variant={globalReserveMode ? "default" : "outline"}
            onClick={handleOpenGlobalReserve}
            size="lg"
            className="rounded-sm uppercase tracking-wide text-xs"
            data-testid="open-reserve-button"
          >
            <Inbox className="w-4 h-4 mr-2" />
            Reserva
          </Button>
        )}

        {/* Herramienta auxiliar */}
        {showAllActions && (
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
        )}

        <div className="flex-1" />

        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span><strong>{visibleConfirmedCount}</strong> confirmadas visibles</span>
          </div>
          {!globalReserveMode && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <span><strong>{ownConfirmedCount}</strong> confirmadas del lote</span>
            </div>
          )}
          {externalVisibleCount > 0 && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-purple-500" />
              <span><strong>{externalVisibleCount}</strong> de otros lotes</span>
            </div>
          )}
          {unclassifiedVisibleCount > 0 && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-slate-400" />
              <span><strong>{unclassifiedVisibleCount}</strong> sin clasificar</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-emerald-500" />
            <span><strong>{distributableQuestions.length}</strong> distribuibles visibles</span>
          </div>
          {(() => {
            const unconfirmedNameCount = questions.filter(q => getNameState(q) !== "confirmed").length;
            return unconfirmedNameCount > 0 ? (
              <button
                onClick={() => {
                  setShowOnlyUnconfirmedNames(!showOnlyUnconfirmedNames);
                  if (!showOnlyUnconfirmedNames) {
                    setShowOnlyDuplicates(false);
                    setShowOnlyNoName(false);
                  }
                }}
                className={`flex items-center gap-2 px-3 py-1 rounded transition-colors cursor-pointer border ${
                  showOnlyUnconfirmedNames
                    ? 'bg-green-600 text-white border-green-600'
                    : 'hover:bg-green-50 border-green-400'
                }`}
                title={showOnlyUnconfirmedNames ? "Ver todas las preguntas" : "Filtrar nombres no confirmados"}
              >
                <div className={`w-3 h-3 rounded-full ${showOnlyUnconfirmedNames ? 'bg-white' : 'bg-green-500'}`} />
                <span className={`font-medium ${showOnlyUnconfirmedNames ? '' : 'text-green-700'}`}>
                  <strong>{unconfirmedNameCount}</strong> nombres no confirmados
                </span>
              </button>
            ) : null;
          })()}
          {(() => {
            const noNameCount = questions.filter(q => getNameState(q) === "missing").length;
            return noNameCount > 0 ? (
              <button
                onClick={() => {
                  setShowOnlyNoName(!showOnlyNoName);
                  if (!showOnlyNoName) {
                    setShowOnlyDuplicates(false);
                    setShowOnlyUnconfirmedNames(false);
                  }
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
                if (!showOnlyDuplicates) {
                  setShowOnlyNoName(false);
                  setShowOnlyUnconfirmedNames(false);
                }
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

      {!duplicateReviewActive && (
        <>
      {/* Assignment Filter */}
      <div className="flex items-center gap-2 mb-6 flex-wrap" data-testid="assignment-filters">
        <span
          className="text-xs uppercase tracking-wide text-muted-foreground mr-2"
          title="Filtra las preguntas según su estado dentro de la selección para programas"
        >
          Estado en programas:
        </span>
        {[
          {
            value: "all",
            label: "Todas visibles",
            count: questions.length,
            dot: "bg-foreground",
            title: "Muestra todas las preguntas cargadas en esta vista"
          },
          {
            value: "included",
            label: "En programas",
            count: includedCount,
            dot: "bg-green-500",
            title: "Preguntas que ya están asignadas a un programa y entrarán en la edición"
          },
          {
            value: "reserve",
            label: "En reserva",
            count: reserveCount,
            dot: "bg-amber-500",
            title: "Preguntas apartadas en Reserva; no entran en programas hasta distribuirlas o incluirlas manualmente"
          },
          {
            value: "unassigned",
            label: "Pendientes",
            count: unassignedCount,
            dot: "bg-slate-400",
            title: "Preguntas válidas todavía no asignadas a programas ni a reserva"
          },
        ].map(option => (
          <button
            key={option.value}
            onClick={() => {
              setAssignmentFilter(option.value);
              setShowOnlyDuplicates(false);
              setShowOnlyNoName(false);
              setShowOnlyUnconfirmedNames(false);
            }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-sm border text-xs transition-colors ${
              assignmentFilter === option.value
                ? 'bg-foreground text-background border-foreground'
                : 'border-border hover:bg-secondary/50'
            }`}
            title={option.title}
            data-testid={`assignment-filter-${option.value}`}
          >
            <div className={`w-2.5 h-2.5 rounded-full ${option.dot}`} />
            <span className="font-medium">{option.label}</span>
            <span className="opacity-70">({option.count})</span>
          </button>
        ))}
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
              {visibleConfirmedCount}
            </span>{" "}
            comentarios listos para procesar{" "}
            <span className="text-green-600">
              ({ownConfirmedCount} del lote{externalVisibleCount > 0 ? ` + ${externalVisibleCount} de otros lotes visibles` : ""})
            </span>
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
              { value: "all", label: "Visibles", count: questions.length, dot: "bg-foreground" },
              { value: "pregunta", label: "Preguntas", count: visibleConfirmedCount, dot: "bg-green-500" },
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
                  setShowOnlyUnconfirmedNames(false);
                  setAssignmentFilter("all");
                }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-sm border text-xs transition-colors ${
                  clasificationFilter === p.value && !showOnlyDuplicates && !showOnlyNoName && !showOnlyUnconfirmedNames
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
        </>
      )}

      {/* Questions List */}
      {duplicateReviewActive ? (
        <DuplicateReview
          duplicates={duplicates}
          loading={loadingDuplicatePairs}
          onDelete={handleDeleteQuestion}
          onKeep={handleKeepBoth}
          onRefresh={fetchDuplicatePairs}
          focusQuestionId={duplicateFocusId}
        />
      ) : (
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
            if (assignmentFilter !== "all") {
              filteredQuestions = filteredQuestions.filter(q => getAssignmentState(q) === assignmentFilter);
            }
            if (showOnlyDuplicates) {
              filteredQuestions = filteredQuestions.filter(q => q.is_duplicate);
            } else if (showOnlyUnconfirmedNames) {
              filteredQuestions = filteredQuestions.filter(q => getNameState(q) !== "confirmed");
            } else if (showOnlyNoName) {
              filteredQuestions = filteredQuestions.filter(q => getNameState(q) === "missing");
            } else if (assignmentFilter === "all" && clasificationFilter !== "all" && questions.some(q => q.clasificacion)) {
              if (clasificationFilter === "pregunta") {
                filteredQuestions = filteredQuestions.filter(q =>
                  q.clasificacion === "pregunta" && !q.is_duplicate && !isGreetingQuestion(q)
                );
              } else {
                filteredQuestions = filteredQuestions.filter(q => q.clasificacion === clasificationFilter);
              }
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
                    {(() => {
                      const assignment = getAssignmentState(question);
                      const program = question.program_id ? programById.get(question.program_id) : null;

                      if (assignment === "included") {
                        return (
                          <Badge
                            variant="outline"
                            className="text-xs text-green-700 border-green-400 bg-green-50"
                            title="Esta pregunta está incluida en un programa de la selección"
                            data-testid={`assignment-included-${question.id}`}
                          >
                            <CheckCircle className="w-3 h-3 mr-1" />
                            {program?.name || `Programa ${question.program_number || ""}`.trim()}
                          </Badge>
                        );
                      }

                      if (assignment === "reserve") {
                        return (
                          <Badge
                            variant="outline"
                            className="text-xs text-amber-700 border-amber-400 bg-amber-50"
                            title="Esta pregunta está en Reserva; tendrá prioridad en la próxima distribución"
                            data-testid={`assignment-reserve-${question.id}`}
                          >
                            Reserva
                          </Badge>
                        );
                      }

                      return (
                        <Badge
                          variant="outline"
                          className="text-xs text-slate-600 border-slate-300 bg-slate-50"
                          title="Esta pregunta todavía no está asignada a programas ni a reserva"
                          data-testid={`assignment-unassigned-${question.id}`}
                        >
                          Pendiente
                        </Badge>
                      );
                    })()}
                    {(question.youtube_video_title || question.youtube_video_id) && (
                      <Badge
                        variant="outline"
                        className="text-xs cursor-pointer max-w-full sm:max-w-[360px] border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100"
                        onClick={() => copyVideoSource(question)}
                        title="Click para copiar el título y enlace del video"
                        data-testid={`video-source-${question.id}`}
                      >
                        <Video className="w-3 h-3 mr-1 flex-shrink-0" />
                        <span className="truncate">
                          {question.youtube_video_title || question.youtube_video_id}
                        </span>
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

                  {getAssignmentState(question) === "reserve" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleIncludeReserveQuestion(question)}
                      disabled={movingQuestionId === question.id || getCandidatePrograms(question).length === 0}
                      className="rounded-sm text-xs text-green-700 border-green-400 hover:bg-green-50"
                      data-testid={`include-reserve-btn-${question.id}`}
                      title="Añadir esta pregunta de Reserva a la edición en curso"
                    >
                      {movingQuestionId === question.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CheckCircle className="w-3.5 h-3.5" />
                      )}
                      <span className="ml-1.5 hidden sm:inline">Incluir</span>
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
      )}

      <SearchModal
        open={showSearchModal}
        onClose={() => setShowSearchModal(false)}
      />
    </div>
  );
}
