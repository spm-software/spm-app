import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { ArrowDownToLine, Database, Eye, FileJson, FileSpreadsheet, FileUp, Loader2, Pencil, Plus, RefreshCw, Search, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { API_BASE_URL as API } from "@/lib/api";

const EMPTY_RECORD = { numero: 0, tipo: "MIN", pasaje: "", tema: "", ciudad: "", iglesia: "", pais: "", fecha: "", disco: "" };
const EMPTY_FILTERS = { numero: "", tipo: "", tema: "", pasaje: "", iglesia: "", ubicacion: "", fecha_desde: "", fecha_hasta: "" };
const FIELDS = [["numero", "Número", "number"], ["tipo", "Tipo", "text"], ["pasaje", "Pasaje", "text"], ["tema", "Tema", "text"], ["ciudad", "Ciudad", "text"], ["iglesia", "Iglesia", "text"], ["pais", "País", "text"], ["fecha", "Fecha", "datetime-local"], ["disco", "Disco", "text"]];
const TYPE_CLASSES = { MIN: "bg-emerald-100 text-emerald-800", MDC: "bg-sky-100 text-sky-800", EVA: "bg-amber-100 text-amber-900", EBI: "bg-rose-100 text-rose-800" };
const queryFilters = (filters) => Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== "" && value != null));
const typeClass = (type) => TYPE_CLASSES[type] || "bg-muted text-muted-foreground";
const dateInputValue = (value) => value ? value.slice(0, 16) : "";
const formatDate = (value) => { if (!value) return "Sin fecha"; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric" }).format(date); };
const formatTimestamp = (value) => value ? new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Sin importaciones registradas";

export default function Cultos() {
  const fileInput = useRef(null);
  const [summary, setSummary] = useState({ record_count: 0, types: [], incomplete_count: 0, date_warning_count: 0, last_import: null });
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState("");
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState(EMPTY_RECORD);

  const loadSummary = async () => setSummary((await axios.get(`${API}/spm-databases/cultos/summary`)).data);
  const loadRecords = async (targetPage = page, activeFilters = filters) => {
    const response = await axios.get(`${API}/spm-databases/cultos/records`, { params: { ...queryFilters(activeFilters), page: targetPage, page_size: 50 } });
    setRecords(response.data.items); setTotal(response.data.total);
  };
  const reload = async (targetPage = page, activeFilters = filters) => {
    setLoading(true);
    try { await Promise.all([loadSummary(), loadRecords(targetPage, activeFilters)]); }
    catch (error) { toast.error(error.response?.data?.detail || "No se pudo cargar la base de cultos"); }
    finally { setLoading(false); }
  };
  useEffect(() => { reload(1); }, []);
  const applyFilters = async (changes = {}) => { const next = { ...filters, ...changes }; setFilters(next); setPage(1); await reload(1, next); };
  const updateFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const submitFilters = (event) => { if (event.key === "Enter") applyFilters(); };
  const totalPages = Math.max(1, Math.ceil(total / 50));
  const goToLatestNumber = async () => {
    try {
      const response = await axios.get(`${API}/spm-databases/cultos/latest-number`);
      const next = { ...EMPTY_FILTERS, numero: String(response.data.numero) };
      setFilters(next);
      setPage(1);
      await reload(1, next);
      toast.success(response.data.record_count > 1 ? `Número ${response.data.numero}: ${response.data.record_count} registros` : `Último número: ${response.data.numero}`);
    } catch (error) {
      toast.error(error.response?.data?.detail || "No se pudo localizar el último número");
    }
  };

  const handleImport = async (event) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      let parsed;
      try { parsed = JSON.parse((await file.text()).replace(/^\uFEFF/, "")); }
      catch { throw new Error("Selecciona cultos-export.json. El archivo .mdb original no se importa directamente desde el navegador."); }
      const payload = Array.isArray(parsed) ? { source_filename: "cultos.mdb", records: parsed } : parsed;
      if (!Array.isArray(payload.records)) throw new Error("El archivo no contiene la lista de registros de Cultos.");
      const response = await axios.post(`${API}/spm-databases/cultos/import`, payload, { timeout: 120000 });
      toast.success(`${response.data.record_count} registros importados sin modificar la copia Access.`); await reload(1);
    } catch (error) { toast.error(error.response?.data?.detail || error.message || "El archivo no es una exportación válida de Cultos."); }
    finally { setImporting(false); }
  };
  const downloadExport = async (format) => {
    setExporting(format);
    try {
      const response = await axios.get(`${API}/spm-databases/cultos/export`, { params: { ...queryFilters(filters), format }, responseType: "blob" });
      const link = document.createElement("a"); const url = URL.createObjectURL(new Blob([response.data]));
      link.href = url; link.download = response.headers["content-disposition"]?.match(/filename="?([^";]+)"?/)?.[1] || `cultos.${format}`;
      document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
      toast.success(format === "csv" ? "Exportación CSV descargada" : "Copia JSON descargada");
    } catch (error) { toast.error(error.response?.data?.detail || "No se pudo preparar la descarga"); }
    finally { setExporting(""); }
  };
  const openNew = () => { setEditing(null); setDraft(EMPTY_RECORD); setEditorOpen(true); };
  const openEdit = (record) => { setEditing(record); setDraft({ ...record, fecha: dateInputValue(record.fecha) }); setEditorOpen(true); };
  const saveRecord = async () => {
    setSaving(true);
    try {
      const payload = { ...draft, numero: Number(draft.numero || 0), fecha: draft.fecha ? new Date(draft.fecha).toISOString() : null };
      if (editing) await axios.put(`${API}/spm-databases/cultos/records/${editing.id}`, payload); else await axios.post(`${API}/spm-databases/cultos/records`, payload);
      toast.success(editing ? "Registro actualizado" : "Registro añadido"); setSelected(null); setEditorOpen(false); await reload(1);
    } catch (error) { toast.error(error.response?.data?.detail || "No se pudo guardar el registro"); }
    finally { setSaving(false); }
  };

  return <div className="p-6 md:p-12 animate-fade-in">
    <div className="mb-6 flex flex-col sm:flex-row sm:items-end gap-3 border-y border-border py-4">
      <label className="grid gap-1 text-sm font-medium">Desde
        <Input type="date" value={filters.fecha_desde} onChange={(event) => applyFilters({ fecha_desde: event.target.value })} className="w-full sm:w-44 rounded-sm" />
      </label>
      <label className="grid gap-1 text-sm font-medium">Hasta
        <Input type="date" value={filters.fecha_hasta} onChange={(event) => applyFilters({ fecha_hasta: event.target.value })} className="w-full sm:w-44 rounded-sm" />
      </label>
      <Button className="rounded-sm bg-primary text-primary-foreground hover:bg-primary/90" onClick={goToLatestNumber} title="Ir directamente al número más alto registrado">
        <ArrowDownToLine className="w-4 h-4 mr-2" />IR AL ÚLTIMO NÚMERO
      </Button>
    </div>
    <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-6 mb-7"><div><p className="text-xs font-semibold uppercase tracking-wide text-primary mb-2">Bases de datos SPM / Cultos</p><h1 className="font-heading text-4xl sm:text-5xl font-bold tracking-tight">CULTOS</h1><p className="text-muted-foreground mt-2">Archivo histórico importado desde Access. Cada modificación conserva la referencia del registro original.</p></div><div className="flex flex-wrap gap-2"><input ref={fileInput} type="file" accept=".json,application/json" className="hidden" onChange={handleImport} /><Button variant="outline" className="hidden" onClick={() => fileInput.current?.click()} disabled={importing || summary.record_count > 0}>{importing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileUp className="w-4 h-4 mr-2" />}Importar JSON</Button><Button variant="outline" className="rounded-sm" onClick={() => downloadExport("csv")} disabled={exporting === "csv" || !summary.record_count}>{exporting === "csv" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 mr-2" />}Exportar CSV</Button><Button variant="outline" size="icon" className="rounded-sm" title="Descargar copia JSON" onClick={() => downloadExport("json")} disabled={exporting === "json" || !summary.record_count}>{exporting === "json" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileJson className="w-4 h-4" />}</Button><Button variant="outline" size="icon" className="rounded-sm" title="Actualizar datos" onClick={() => reload(page)}><RefreshCw className="w-4 h-4" /></Button><Button className="rounded-sm" onClick={openNew}><Plus className="w-4 h-4 mr-2" />Añadir registro</Button></div></div>
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6"><Card className="rounded-sm lg:col-span-2"><CardContent className="p-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">Última importación</p><p className="font-semibold mt-2">{summary.last_import?.source_filename || "Sin archivo de origen"}</p><p className="text-sm text-muted-foreground mt-1">{formatTimestamp(summary.last_import?.imported_at)} · {summary.last_import?.record_count || 0} registros</p></CardContent></Card><Card className="rounded-sm"><CardContent className="p-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">Registros activos</p><p className="font-heading text-4xl font-bold mt-2">{summary.record_count}</p></CardContent></Card><Card className="rounded-sm"><CardContent className="p-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">Avisos de datos</p><p className="font-heading text-4xl font-bold mt-2">{summary.incomplete_count + summary.date_warning_count}</p><p className="text-xs text-muted-foreground mt-2">{summary.incomplete_count} incompletos · {summary.date_warning_count} fechas</p></CardContent></Card></div>
    <Card className="rounded-sm border-border"><CardHeader className="pb-4"><div className="flex items-center justify-between gap-3"><CardTitle className="font-heading text-xl uppercase flex items-center gap-2"><Database className="w-5 h-5 text-primary" /> Registros</CardTitle><span className="text-sm text-muted-foreground">{total} resultados</span></div><div className="flex flex-wrap gap-2 pt-4"><Button variant={!filters.tipo ? "default" : "outline"} size="sm" className="rounded-sm" onClick={() => applyFilters({ tipo: "" })}>Todos</Button>{summary.types.slice(0, 10).map((item) => <Button key={item.value || "empty"} variant={filters.tipo === item.value ? "default" : "outline"} size="sm" className="rounded-sm" onClick={() => applyFilters({ tipo: item.value })}>{item.value || "Sin tipo"} <span className="ml-1 opacity-70">{item.count}</span></Button>)}</div><div className="flex flex-wrap items-center gap-3 pt-4 text-sm"><Button variant="ghost" size="sm" className="rounded-sm" onClick={() => applyFilters(EMPTY_FILTERS)}><X className="w-4 h-4 mr-1" />Limpiar filtros</Button><span className="inline-flex items-center gap-1.5 text-muted-foreground"><TriangleAlert className="w-4 h-4 text-amber-600" /> Requiere revisión; no altera el dato original.</span></div></CardHeader><CardContent>{loading ? <div className="h-72 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div> : records.length === 0 ? <div className="h-72 flex flex-col items-center justify-center text-center border border-dashed border-border"><Database className="w-8 h-8 text-muted-foreground mb-3" /><h2 className="font-heading text-xl font-bold">No hay registros para estos filtros</h2></div> : <><div className="hidden md:block overflow-x-auto border border-border"><table className="w-full min-w-[1120px] text-sm"><thead className="bg-secondary/70 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="text-left p-3">Fecha</th><th className="text-left p-3">N.º</th><th className="text-left p-3">Tipo</th><th className="text-left p-3">Tema</th><th className="text-left p-3">Pasaje</th><th className="text-left p-3">Ciudad / país</th><th className="text-left p-3">Iglesia</th><th className="text-right p-3">Acciones</th></tr><tr className="border-t border-border normal-case"><th className="p-2"><div className="grid grid-cols-2 gap-1"><Input aria-label="Fecha desde" type="date" value={filters.fecha_desde} onChange={(event) => applyFilters({ fecha_desde: event.target.value })} className="h-8 min-w-[112px] px-1 text-xs rounded-sm" /><Input aria-label="Fecha hasta" type="date" value={filters.fecha_hasta} onChange={(event) => applyFilters({ fecha_hasta: event.target.value })} className="h-8 min-w-[112px] px-1 text-xs rounded-sm" /></div></th><th className="p-2"><Input aria-label="Número" type="number" value={filters.numero} onChange={(event) => updateFilter("numero", event.target.value)} onKeyDown={submitFilters} placeholder="N.º" className="h-8 min-w-[68px] px-2 text-xs rounded-sm" /></th><th className="p-2"><select aria-label="Tipo" value={filters.tipo} onChange={(event) => applyFilters({ tipo: event.target.value })} className="h-8 w-full min-w-[82px] border border-input bg-background px-1.5 text-xs rounded-sm"><option value="">Todos</option>{summary.types.map((item) => <option key={item.value} value={item.value}>{item.value || "Sin tipo"}</option>)}</select></th><th className="p-2"><Input aria-label="Tema" value={filters.tema} onChange={(event) => updateFilter("tema", event.target.value)} onKeyDown={submitFilters} placeholder="Filtrar tema" className="h-8 min-w-[135px] px-2 text-xs rounded-sm" /></th><th className="p-2"><Input aria-label="Pasaje" value={filters.pasaje} onChange={(event) => updateFilter("pasaje", event.target.value)} onKeyDown={submitFilters} placeholder="Filtrar pasaje" className="h-8 min-w-[115px] px-2 text-xs rounded-sm" /></th><th className="p-2"><Input aria-label="Ciudad o país" value={filters.ubicacion} onChange={(event) => updateFilter("ubicacion", event.target.value)} onKeyDown={submitFilters} placeholder="Ciudad / país" className="h-8 min-w-[135px] px-2 text-xs rounded-sm" /></th><th className="p-2"><Input aria-label="Iglesia" value={filters.iglesia} onChange={(event) => updateFilter("iglesia", event.target.value)} onKeyDown={submitFilters} placeholder="Filtrar iglesia" className="h-8 min-w-[130px] px-2 text-xs rounded-sm" /></th><th className="p-2 text-right"><Button type="button" variant="outline" size="icon" className="h-8 w-8 rounded-sm" title="Aplicar filtros de columnas" onClick={() => applyFilters()}><Search className="w-3.5 h-3.5" /></Button></th></tr></thead><tbody>{records.map((record) => <tr key={record.id} onClick={() => setSelected(record)} className="cursor-pointer border-t border-border odd:bg-background even:bg-muted/35 hover:bg-primary/5 transition-colors"><td className="p-3 whitespace-nowrap text-muted-foreground">{formatDate(record.fecha)}</td><td className="p-3 font-mono">{record.numero}</td><td className="p-3"><span className={`px-2 py-1 font-mono text-xs ${typeClass(record.tipo)}`}>{record.tipo || "—"}</span></td><td className="p-3 font-medium max-w-[250px]"><div className="flex items-center gap-2"><span>{record.tema || "—"}</span>{(record.has_date_warning || record.missing_fields?.length) && <TriangleAlert className="w-4 h-4 text-amber-600" />}</div></td><td className="p-3 max-w-[180px]">{record.pasaje || "—"}</td><td className="p-3">{[record.ciudad, record.pais].filter(Boolean).join(", ") || "—"}</td><td className="p-3">{record.iglesia || "—"}</td><td className="p-3"><div className="flex justify-end gap-1" onClick={(event) => event.stopPropagation()}><Button variant="ghost" size="icon" className="rounded-sm" title="Ver ficha" onClick={() => setSelected(record)}><Eye className="w-4 h-4" /></Button><Button variant="ghost" size="icon" className="rounded-sm" title="Editar registro" onClick={() => openEdit(record)}><Pencil className="w-4 h-4" /></Button></div></td></tr>)}</tbody></table></div><div className="grid md:hidden gap-3">{records.map((record) => <button key={record.id} type="button" onClick={() => setSelected(record)} className="text-left border border-border p-4 rounded-sm bg-background hover:bg-muted/50"><div className="flex justify-between gap-3"><div><p className="font-semibold">{record.tema || "Sin tema"}</p><p className="text-sm text-muted-foreground mt-1">{formatDate(record.fecha)} · {record.numero}</p></div><span className={`h-fit px-2 py-1 font-mono text-xs ${typeClass(record.tipo)}`}>{record.tipo || "—"}</span></div><p className="text-sm mt-3">{record.pasaje || "Sin pasaje"}</p></button>)}</div></>}<div className="flex items-center justify-between gap-4 mt-5"><span className="text-sm text-muted-foreground">Página {page} de {totalPages}</span><div className="flex gap-2"><Button variant="outline" className="rounded-sm" disabled={page <= 1 || loading} onClick={() => { setPage(page - 1); reload(page - 1); }}>Anterior</Button><Button variant="outline" className="rounded-sm" disabled={page >= totalPages || loading} onClick={() => { setPage(page + 1); reload(page + 1); }}>Siguiente</Button></div></div></CardContent></Card>
    <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}><DialogContent className="max-w-xl rounded-sm max-h-[90vh] overflow-y-auto">{selected && <><DialogHeader><DialogTitle className="flex items-center gap-3"><span className={`px-2 py-1 font-mono text-xs ${typeClass(selected.tipo)}`}>{selected.tipo || "—"}</span>{selected.tema || "Sin tema"}</DialogTitle><DialogDescription>Ficha del registro y referencia de procedencia.</DialogDescription></DialogHeader><div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5 py-3">{[["Fecha", formatDate(selected.fecha)], ["Número", selected.numero], ["Pasaje", selected.pasaje || "Sin dato"], ["Disco", selected.disco || "Sin dato"], ["Ciudad", selected.ciudad || "Sin dato"], ["País", selected.pais || "Sin dato"], ["Iglesia", selected.iglesia || "Sin dato"], ["Origen", selected.source_database === "web" ? "Añadido desde la web" : `${selected.source_filename || "cultos.mdb"} · fila ${selected.source_row_number || "—"}`]].map(([label, value]) => <div key={label}><p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p><p className="font-medium mt-1">{value}</p></div>)}</div><DialogFooter className="mt-3"><Button variant="outline" className="rounded-sm" onClick={() => openEdit(selected)}><Pencil className="w-4 h-4 mr-2" />Editar</Button></DialogFooter></>}</DialogContent></Dialog>
    <Dialog open={editorOpen} onOpenChange={setEditorOpen}><DialogContent className="max-w-2xl rounded-sm max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{editing ? "Editar registro" : "Añadir registro"}</DialogTitle><DialogDescription>Los campos se guardan separados de la copia original importada.</DialogDescription></DialogHeader><div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-3">{FIELDS.map(([key, label, type]) => <label key={key} className={key === "tema" || key === "iglesia" ? "sm:col-span-2" : ""}><span className="text-xs uppercase tracking-wide text-muted-foreground block mb-2">{label}</span><Input type={type} value={draft[key] ?? ""} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} className="rounded-sm" /></label>)}</div><DialogFooter><Button variant="outline" className="rounded-sm" onClick={() => setEditorOpen(false)}><X className="w-4 h-4 mr-2" />Cancelar</Button><Button className="rounded-sm" onClick={saveRecord} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{editing ? "Guardar cambios" : "Crear registro"}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
