import { useEffect, useRef, useState } from "react";
import { Check, CheckCircle, Copy, ExternalLink, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const pairKey = (pair) => `${pair.original_question.id}:${pair.new_question.id}`;
const dateLabel = (value) => {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime()) ? date.toLocaleString("es-ES") : "Sin fecha";
};

function Question({ question, label }) {
  return (
    <div className="min-w-0 space-y-2">
      <p className="text-xs font-bold uppercase text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold break-words">{question.real_name || question.username || "Usuario desconocido"}</p>
      <p className="text-xs text-muted-foreground break-words">{question.batch_name || "Lote desconocido"} · {dateLabel(question.created_at)}</p>
      <p className="whitespace-pre-wrap break-words text-base leading-relaxed">{question.text}</p>
    </div>
  );
}

export default function DuplicateReview({ duplicates, loading, onDelete, onKeep, onRefresh, focusQuestionId }) {
  // Keep reviewed snapshots in place while the server's pending list shrinks.
  const [rows, setRows] = useState(duplicates.map((pair) => ({ pair, result: null })));
  const [busy, setBusy] = useState(null);
  const actionLock = useRef(false);
  const elements = useRef(new Map());

  useEffect(() => {
    setRows((previous) => {
      const incoming = new Map(duplicates.map((pair) => [pairKey(pair), pair]));
      const existing = new Set(previous.map(({ pair }) => pairKey(pair)));
      return [
        ...previous.map((row) => incoming.has(pairKey(row.pair))
          ? { pair: incoming.get(pairKey(row.pair)), result: null }
          : row),
        ...duplicates.filter((pair) => !existing.has(pairKey(pair))).map((pair) => ({ pair, result: null })),
      ];
    });
  }, [duplicates]);

  useEffect(() => {
    if (!focusQuestionId) return;
    const pair = duplicates.find((item) => [item.new_question.id, item.original_question.id].includes(focusQuestionId));
    if (pair) elements.current.get(pairKey(pair))?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusQuestionId, duplicates]);

  const decide = async (pair, action) => {
    if (actionLock.current) return;
    if (action === "original" && !window.confirm("¿Eliminar la pregunta original y conservar la nueva?")) return;
    if (action === "both" && !window.confirm("¿Eliminar ambas preguntas, incluida la original?")) return;
    const key = pairKey(pair);
    actionLock.current = true;
    setBusy(key);
    let result = null;
    try {
      if (action === "keep") {
        if (await onKeep(pair.new_question.id)) result = { label: "Procesada: ambas preguntas conservadas", ok: true };
      } else {
        const firstId = action === "original" ? pair.original_question.id : pair.new_question.id;
        if (await onDelete(firstId)) {
          result = { label: action === "original" ? "Procesada: original eliminada, nueva conservada" : "Procesada: duplicada eliminada, original conservada", ok: true };
          if (action === "both") {
            result = await onDelete(pair.original_question.id)
              ? { label: "Procesada: ambas preguntas eliminadas", ok: true }
              : { label: "Duplicada eliminada. No se pudo eliminar la original; sigue conservada.", ok: false };
          }
        }
      }
    } finally {
      if (result) setRows((current) => current.map((row) => pairKey(row.pair) === key ? { ...row, result } : row));
      actionLock.current = false;
      setBusy(null);
    }
  };

  const pending = new Set(duplicates.map(pairKey));
  const processed = rows.filter((row) => row.result?.ok && !pending.has(pairKey(row.pair))).length;

  return (
    <section data-testid="duplicate-review" className="max-h-[calc(100vh-15rem)] overflow-y-auto border-y border-border">
      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background px-3 py-4 sm:px-5">
        <div className="flex flex-wrap items-center gap-3">
          <Copy className="h-5 w-5 text-primary" />
          <h2 className="font-heading text-2xl">COMPARAR DUPLICADOS</h2>
          <span className="text-sm">{duplicates.length} pendientes</span>
          <span className="text-sm font-semibold text-green-700 dark:text-green-300">{processed} procesadas</span>
        </div>
        <Button variant="outline" className="rounded-sm" disabled={loading || Boolean(busy)} onClick={onRefresh}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Actualizar
        </Button>
      </header>
      {rows.length === 0 && <p className="py-12 text-center text-muted-foreground">{loading ? "Cargando comparaciones..." : "No quedan parejas pendientes en este lote."}</p>}
      {rows.map(({ pair, result }, index) => {
        const key = pairKey(pair);
        const isPending = pending.has(key) && !result;
        const isBusy = busy === key;
        const status = result || (!isPending ? { label: "Ya no está pendiente: la pareja cambió al revisar otra pregunta", ok: false } : null);
        return (
          <article
            key={key}
            ref={(node) => { if (node) elements.current.set(key, node); else elements.current.delete(key); }}
            data-testid={`duplicate-pair-${pair.new_question.id}`}
            className={`border-b border-border px-3 py-5 transition-opacity sm:px-5 ${status?.ok ? "bg-green-50 opacity-60 dark:bg-green-950/30" : "odd:bg-muted/20"}`}
          >
            <div className="mb-4 flex min-h-8 flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold">Pareja {index + 1}</span>
              {status ? <span role="status" className={`flex items-center gap-2 font-semibold ${status.ok ? "text-green-700 dark:text-green-300" : "text-amber-700 dark:text-amber-300"}`}>
                {status.ok && <CheckCircle className="h-5 w-5 shrink-0" />}{status.label}
              </span> : <span className="text-muted-foreground">Pendiente de revisión</span>}
            </div>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-8">
              <Question question={pair.original_question} label="Original" />
              <Question question={pair.new_question} label="Posible duplicada" />
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Button disabled={!isPending || Boolean(busy) || loading} className="h-auto min-h-10 whitespace-normal rounded-sm bg-green-700 text-white hover:bg-green-800" onClick={() => decide(pair, "keep")}>
                {isBusy ? <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin" /> : <Check className="mr-2 h-4 w-4 shrink-0" />}Conservar ambas
              </Button>
              <Button disabled={!isPending || Boolean(busy) || loading} className="h-auto min-h-10 whitespace-normal rounded-sm bg-orange-600 text-white hover:bg-orange-700" onClick={() => decide(pair, "duplicate")}>
                <Trash2 className="mr-2 h-4 w-4 shrink-0" />Borrar más nueva
              </Button>
              <Button variant="destructive" disabled={!isPending || Boolean(busy) || loading} className="h-auto min-h-10 whitespace-normal rounded-sm" onClick={() => decide(pair, "both")}>
                <Trash2 className="mr-2 h-4 w-4 shrink-0" />Borrar ambas
              </Button>
            </div>
            <details className="mt-3 text-sm">
              <summary className="w-fit cursor-pointer py-2 text-muted-foreground">Detalles</summary>
              <div className="grid gap-4 py-3 md:grid-cols-2">
                {[pair.original_question, pair.new_question].map((question, side) => (
                  <div key={side} className="min-w-0 break-words">
                    <p className="font-semibold">{side === 0 ? "Original" : "Posible duplicada"}: {question.username}</p>
                    <p>{question.video_title || "Vídeo no disponible"}</p>
                    {question.video_id && <a href={`https://www.youtube.com/watch?v=${encodeURIComponent(question.video_id)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 py-2 text-primary">Ver vídeo <ExternalLink className="h-4 w-4" /></a>}
                  </div>
                ))}
              </div>
            </details>
          </article>
        );
      })}
    </section>
  );
}
