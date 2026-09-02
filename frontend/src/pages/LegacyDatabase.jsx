import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { ArrowLeft, Database, FileJson, FileSpreadsheet, FileUp, Loader2, Pencil, Plus, RefreshCw, Search, X } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { API_BASE_URL as API } from "@/lib/api";

const formatValue = (field, value) => {
  if (value === null || value === undefined || value === "") return "—";
  if (field.type !== "date") return String(value);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(date);
};

const inputValue = (field, value) => {
  if (value === null || value === undefined) return "";
  if (field.type === "date") return String(value).slice(0, 16);
  return String(value);
};

export default function LegacyDatabase() {
  const { databaseId } = useParams();
  const navigate = useNavigate();
  const fileInput = useRef(null);
  const [database, setDatabase] = useState(null);
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({});
  const [editorOpen, setEditorOpen] = useState(false);

  const loadDatabase = async () => {
    const response = await axios.get(`${API}/spm-databases/legacy/${databaseId}`);
    setDatabase(response.data);
    return response.data;
  };
  const loadRecords = async (targetPage = page, targetSearch = search) => {
    const response = await axios.get(`${API}/spm-databases/legacy/${databaseId}/records`, { params: { page: targetPage, page_size: 50, ...(targetSearch ? { search: targetSearch } : {}) } });
    setRecords(response.data.items);
    setTotal(response.data.total);
  };
  const reload = async (targetPage = page, targetSearch = search) => {
    setLoading(true);
    try { await Promise.all([loadDatabase(), loadRecords(targetPage, targetSearch)]); }
    catch (error) { toast.error(error.response?.data?.detail || "No se pudo cargar esta base de datos"); }
    finally { setLoading(false); }
  };
  useEffect(() => { setPage(1); setSearch(""); reload(1, ""); }, [databaseId]);

  const applySearch = async () => { setPage(1); await reload(1, search); };
  const openNew = () => { setEditing(null); setDraft({}); setEditorOpen(true); };
  const openEdit = (record) => { setEditing(record); setDraft(record.data || {}); setEditorOpen(true); };
  const handleImport = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      let parsed;
      try { parsed = JSON.parse((await file.text()).replace(/^\uFEFF/, "")); }
      catch { throw new Error("Selecciona el archivo JSON exportado para esta base."); }
      const payload = Array.isArray(parsed) ? { source_filename: database.source, records: parsed } : parsed;
      if (!Array.isArray(payload.records)) throw new Error("El archivo no contiene registros válidos.");
      const response = await axios.post(`${API}/spm-databases/legacy/${databaseId}/import`, payload, { timeout: 120000 });
      toast.success(`${response.data.record_count} registros importados sin modificar Access.`);
      await reload(1);
    } catch (error) { toast.error(error.response?.data?.detail || error.message || "No se pudo importar el archivo."); }
    finally { setImporting(false); }
  };
  const save = async () => {
    setSaving(true);
    try {
      const payload = { data: draft };
      if (editing) await axios.put(`${API}/spm-databases/legacy/${databaseId}/records/${editing.id}`, payload);
      else await axios.post(`${API}/spm-databases/legacy/${databaseId}/records`, payload);
      toast.success(editing ? "Registro actualizado" : "Registro añadido");
      setEditorOpen(false);
      await reload(1);
    } catch (error) { toast.error(error.response?.data?.detail || "No se pudo guardar el registro"); }
    finally { setSaving(false); }
  };
  const download = async (format) => {
    setExporting(format);
    try {
      const response = await axios.get(`${API}/spm-databases/legacy/${databaseId}/export`, { params: { format }, responseType: "blob" });
      const url = URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.download = response.headers["content-disposition"]?.match(/filename="?([^";]+)"?/)?.[1] || `${databaseId}.${format}`;
      document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
      toast.success(format === "csv" ? "Exportación CSV descargada" : "Copia JSON descargada");
    } catch (error) { toast.error(error.response?.data?.detail || "No se pudo preparar la descarga"); }
    finally { setExporting(""); }
  };

  const totalPages = Math.max(1, Math.ceil(total / 50));
  if (!database && loading) return <div className="p-12 h-72 flex items-center justify-center"><Loader2 className="w-7 h-7 text-primary animate-spin" /></div>;
  if (!database) return <div className="p-12"><Button variant="outline" className="rounded-sm" onClick={() => navigate("/bases-de-datos")}><ArrowLeft className="w-4 h-4 mr-2" />Volver a bases de datos</Button></div>;

  return <div className="p-6 md:p-12 animate-fade-in">
    <Button variant="ghost" className="rounded-sm mb-5" onClick={() => navigate("/bases-de-datos")}><ArrowLeft className="w-4 h-4 mr-2" />Bases de datos SPM</Button>
    <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-6 mb-7"><div><p className="text-xs font-semibold uppercase tracking-wide text-primary mb-2">{database.source}</p><h1 className="font-heading text-4xl sm:text-5xl font-bold tracking-tight">{database.name}</h1><p className="text-muted-foreground mt-2">{database.description}</p></div><div className="flex flex-wrap gap-2"><input ref={fileInput} type="file" accept=".json,application/json" className="hidden" onChange={handleImport} /><Button variant="outline" className="rounded-sm" disabled={importing || database.record_count > 0} onClick={() => fileInput.current?.click()}>{importing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileUp className="w-4 h-4 mr-2" />}Importar JSON</Button><Button variant="outline" className="rounded-sm" disabled={exporting === "csv" || !database.record_count} onClick={() => download("csv")}>{exporting === "csv" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 mr-2" />}Exportar CSV</Button><Button variant="outline" size="icon" className="rounded-sm" title="Descargar copia JSON" disabled={exporting === "json" || !database.record_count} onClick={() => download("json")}>{exporting === "json" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileJson className="w-4 h-4" />}</Button><Button variant="outline" size="icon" className="rounded-sm" title="Actualizar datos" onClick={() => reload(page)}><RefreshCw className="w-4 h-4" /></Button><Button className="rounded-sm" onClick={openNew}><Plus className="w-4 h-4 mr-2" />Añadir registro</Button></div></div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6"><Card className="rounded-sm"><CardContent className="p-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">Registros</p><p className="font-heading text-4xl font-bold mt-2">{database.record_count}</p></CardContent></Card><Card className="rounded-sm"><CardContent className="p-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">Última importación</p><p className="font-medium mt-2">{database.last_import?.source_filename || "Sin importar"}</p><p className="text-xs text-muted-foreground mt-1">{database.last_import?.record_count || 0} registros</p></CardContent></Card></div>
    <Card className="rounded-sm border-border"><CardHeader><div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between"><CardTitle className="font-heading text-xl uppercase flex items-center gap-2"><Database className="w-5 h-5 text-primary" /> Registros</CardTitle><span className="text-sm text-muted-foreground">{total} resultados</span></div><div className="relative max-w-xl mt-4"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input className="pl-9 rounded-sm" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === "Enter" && applySearch()} placeholder="Buscar en todos los campos de texto..." /></div></CardHeader><CardContent>{loading ? <div className="h-64 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div> : records.length === 0 ? <div className="h-64 flex flex-col items-center justify-center text-center border border-dashed border-border"><Database className="w-8 h-8 text-muted-foreground mb-3" /><h2 className="font-heading text-xl font-bold">Aún no hay registros</h2><p className="text-sm text-muted-foreground mt-1">Importa el JSON exportado desde Access para comenzar.</p></div> : <><div className="overflow-x-auto border border-border"><table className="w-full min-w-[900px] text-sm"><thead className="bg-secondary/70 text-xs uppercase tracking-wide text-muted-foreground"><tr>{database.fields.map((field) => <th key={field.key} className="text-left p-3">{field.label}</th>)}<th className="text-right p-3">Acciones</th></tr></thead><tbody>{records.map((record) => <tr key={record.id} className="border-t border-border odd:bg-background even:bg-muted/35 hover:bg-primary/5"><>{database.fields.map((field) => <td key={field.key} className="p-3 max-w-[250px]">{formatValue(field, record.data?.[field.key])}</td>)}</><td className="p-3 text-right"><Button variant="ghost" size="icon" className="rounded-sm" title="Editar registro" onClick={() => openEdit(record)}><Pencil className="w-4 h-4" /></Button></td></tr>)}</tbody></table></div><div className="flex items-center justify-between gap-4 mt-5"><span className="text-sm text-muted-foreground">Página {page} de {totalPages}</span><div className="flex gap-2"><Button variant="outline" className="rounded-sm" disabled={page <= 1} onClick={() => { setPage(page - 1); reload(page - 1); }}>Anterior</Button><Button variant="outline" className="rounded-sm" disabled={page >= totalPages} onClick={() => { setPage(page + 1); reload(page + 1); }}>Siguiente</Button></div></div></>}</CardContent></Card>
    <Dialog open={editorOpen} onOpenChange={setEditorOpen}><DialogContent className="max-w-3xl rounded-sm max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{editing ? "Editar registro" : "Añadir registro"}</DialogTitle><DialogDescription>Los cambios se guardan separados de la copia Access de origen.</DialogDescription></DialogHeader><div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-3">{database.fields.map((field) => <label key={field.key} className={field.type === "text" ? "sm:col-span-2" : ""}><span className="text-xs uppercase tracking-wide text-muted-foreground block mb-2">{field.label}</span><Input type={field.type === "date" ? "datetime-local" : field.type} value={inputValue(field, draft[field.key])} onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })} className="rounded-sm" /></label>)}</div><DialogFooter><Button variant="outline" className="rounded-sm" onClick={() => setEditorOpen(false)}><X className="w-4 h-4 mr-2" />Cancelar</Button><Button className="rounded-sm" disabled={saving} onClick={save}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{editing ? "Guardar cambios" : "Crear registro"}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
