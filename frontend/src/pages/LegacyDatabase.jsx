import { useEffect, useState } from "react";
import axios from "axios";
import { ArrowDownToLine, ArrowLeft, Database, FileJson, FileSpreadsheet, Loader2, Pencil, Plus, RefreshCw, Search, Settings2, X } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import DatabaseFieldsEditor, { buildDatabaseFields } from "@/components/DatabaseFieldsEditor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { API_BASE_URL as API } from "@/lib/api";

const formatValue = (field, value) => {
  if (value === null || value === undefined || value === "") return "—";
  if (field.type !== "date") return String(value);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(date);
};

const inputValue = (field, value) => {
  if (value === null || value === undefined) return "";
  if (field.type === "date") return String(value).slice(0, 10);
  return String(value);
};

const hasFilters = (filters) => Object.values(filters).some((value) => {
  if (value && typeof value === "object") return value.from || value.to;
  return value !== "" && value !== null && value !== undefined;
});

export default function LegacyDatabase() {
  const { databaseId } = useParams();
  const navigate = useNavigate();
  const [database, setDatabase] = useState(null);
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({});
  const [loading, setLoading] = useState(true);
  const [latestLoading, setLatestLoading] = useState(false);
  const [exporting, setExporting] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({});
  const [editorOpen, setEditorOpen] = useState(false);
  const [schemaOpen, setSchemaOpen] = useState(false);
  const [schemaSaving, setSchemaSaving] = useState(false);
  const [schema, setSchema] = useState(null);

  const loadDatabase = async () => {
    const response = await axios.get(`${API}/spm-databases/legacy/${databaseId}`);
    setDatabase(response.data);
    return response.data;
  };

  const loadRecords = async (targetPage = page, targetSearch = search, targetFilters = filters) => {
    const response = await axios.get(`${API}/spm-databases/legacy/${databaseId}/records`, {
      params: {
        page: targetPage,
        page_size: 50,
        ...(targetSearch ? { search: targetSearch } : {}),
        ...(hasFilters(targetFilters) ? { filters: JSON.stringify(targetFilters) } : {}),
      },
    });
    setRecords(response.data.items);
    setTotal(response.data.total);
  };

  const reload = async (targetPage = page, targetSearch = search, targetFilters = filters) => {
    setLoading(true);
    try {
      await Promise.all([loadDatabase(), loadRecords(targetPage, targetSearch, targetFilters)]);
    } catch (error) {
      toast.error(error.response?.data?.detail || "No se pudo cargar esta base de datos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
    setSearch("");
    setFilters({});
    reload(1, "", {});
    // Reload only when navigating to a different database.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [databaseId]);

  const applyFilters = async () => {
    setPage(1);
    await reload(1, search, filters);
  };

  const clearFilters = async () => {
    setSearch("");
    setFilters({});
    setPage(1);
    await reload(1, "", {});
  };

  const updateFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const updateDateFilter = (key, part, value) => setFilters((current) => ({
    ...current,
    [key]: { ...(current[key] || {}), [part]: value },
  }));

  const openNew = () => {
    setEditing(null);
    setDraft({});
    setEditorOpen(true);
  };

  const openEdit = (record) => {
    setEditing(record);
    setDraft(record.data || {});
    setEditorOpen(true);
  };

  const goToLatestNumber = async () => {
    setLatestLoading(true);
    try {
      const response = await axios.get(`${API}/spm-databases/legacy/${databaseId}/latest-number`);
      setSearch("");
      setFilters({});
      setPage(1);
      setRecords([response.data.record]);
      setTotal(1);
      toast.success(`${response.data.label}: ${response.data.value}`);
    } catch (error) {
      toast.error(error.response?.data?.detail || "No se pudo localizar el último número");
    } finally {
      setLatestLoading(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = { data: draft };
      if (editing) await axios.put(`${API}/spm-databases/legacy/${databaseId}/records/${editing.id}`, payload);
      else await axios.post(`${API}/spm-databases/legacy/${databaseId}/records`, payload);
      toast.success(editing ? "Registro actualizado" : "Registro añadido");
      setEditorOpen(false);
      await reload(1, search, filters);
    } catch (error) {
      toast.error(error.response?.data?.detail || "No se pudo guardar el registro");
    } finally {
      setSaving(false);
    }
  };

  const download = async (format) => {
    setExporting(format);
    try {
      const response = await axios.get(`${API}/spm-databases/legacy/${databaseId}/export`, { params: { format }, responseType: "blob" });
      const url = URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.download = response.headers["content-disposition"]?.match(/filename="?([^";]+)"?/)?.[1] || `${databaseId}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success(format === "csv" ? "Exportación CSV descargada" : "Copia JSON descargada");
    } catch (error) {
      toast.error(error.response?.data?.detail || "No se pudo preparar la descarga");
    } finally {
      setExporting("");
    }
  };

  const openSchema = () => {
    const fields = database.fields.map((field) => ({ ...field, _rowId: field.key }));
    setSchema({
      name: database.name,
      description: database.description,
      fields,
      latestRowId: database.latest_number_field || "",
    });
    setSchemaOpen(true);
  };

  const saveSchema = async () => {
    if (!schema.name.trim()) return toast.error("Escribe el nombre de la base de datos");
    if (!schema.fields.length || schema.fields.some((field) => !field.label.trim())) return toast.error("Todos los campos deben tener nombre");
    const fields = buildDatabaseFields(schema.fields);
    const latestField = fields.find((field) => field._rowId === schema.latestRowId);
    const existingSortField = fields.some((field) => field.key === database.sort_field) ? database.sort_field : null;
    setSchemaSaving(true);
    try {
      const response = await axios.put(`${API}/spm-databases/custom/${databaseId}`, {
        name: schema.name,
        description: schema.description,
        fields: fields.map(({ _rowId, ...field }) => field),
        latest_number_field: latestField?.type === "number" ? latestField.key : null,
        sort_field: latestField?.key || existingSortField || fields[0].key,
      });
      setDatabase(response.data);
      setSchemaOpen(false);
      setFilters({});
      toast.success("Estructura actualizada");
      await reload(1, "", {});
    } catch (error) {
      toast.error(error.response?.data?.detail || "No se pudo actualizar la estructura");
    } finally {
      setSchemaSaving(false);
    }
  };

  const renderEditorField = (field) => {
    const value = inputValue(field, draft[field.key]);
    const onChange = (nextValue) => setDraft((current) => ({ ...current, [field.key]: nextValue }));
    if (field.type === "long_text") {
      return <Textarea value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 min-h-28 rounded-sm" />;
    }
    if (field.type === "select") {
      return (
        <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-9 w-full border border-input bg-background px-3 text-sm rounded-sm">
          <option value="">Seleccionar</option>
          {(field.options || []).map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      );
    }
    const inputType = { number: "number", date: "date", email: "email", phone: "tel" }[field.type] || "text";
    return <Input type={inputType} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 rounded-sm" />;
  };

  const renderFilter = (field) => {
    if (field.type === "date") {
      return (
        <div className="grid grid-cols-2 gap-1">
          <Input aria-label={`${field.label} desde`} type="date" value={filters[field.key]?.from || ""} onChange={(event) => updateDateFilter(field.key, "from", event.target.value)} className="h-8 min-w-28 px-1 text-xs rounded-sm" />
          <Input aria-label={`${field.label} hasta`} type="date" value={filters[field.key]?.to || ""} onChange={(event) => updateDateFilter(field.key, "to", event.target.value)} className="h-8 min-w-28 px-1 text-xs rounded-sm" />
        </div>
      );
    }
    if (field.type === "select") {
      return (
        <select aria-label={`Filtrar ${field.label}`} value={filters[field.key] || ""} onChange={(event) => updateFilter(field.key, event.target.value)} className="h-8 min-w-28 w-full border border-input bg-background px-2 text-xs rounded-sm">
          <option value="">Todos</option>
          {(field.options || []).map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      );
    }
    return (
      <Input
        aria-label={`Filtrar ${field.label}`}
        type={field.type === "number" ? "number" : "text"}
        value={filters[field.key] || ""}
        onChange={(event) => updateFilter(field.key, event.target.value)}
        onKeyDown={(event) => event.key === "Enter" && applyFilters()}
        placeholder="Filtrar"
        className="h-8 min-w-28 px-2 text-xs rounded-sm"
      />
    );
  };

  const totalPages = Math.max(1, Math.ceil(total / 50));
  if (!database && loading) return <div className="p-12 h-72 flex items-center justify-center"><Loader2 className="w-7 h-7 text-primary animate-spin" /></div>;
  if (!database) return <div className="p-12"><Button variant="outline" className="rounded-sm" onClick={() => navigate("/bases-de-datos")}><ArrowLeft className="w-4 h-4 mr-2" />Volver a bases de datos</Button></div>;

  return (
    <div className="p-6 md:p-12 animate-fade-in">
      <Button variant="ghost" className="rounded-sm mb-5" onClick={() => navigate("/bases-de-datos")}><ArrowLeft className="w-4 h-4 mr-2" />Bases de datos SPM</Button>

      <div className="mb-6 border-y border-border py-4 flex flex-wrap gap-2">
        <Button className="rounded-sm" disabled={latestLoading || !database.record_count || !database.latest_number_field} onClick={goToLatestNumber} title={database.latest_number_field ? "Mostrar directamente el número más alto registrado" : "Esta base no tiene un campo numérico principal"}>
          {latestLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowDownToLine className="w-4 h-4 mr-2" />}IR AL ÚLTIMO NÚMERO
        </Button>
        {database.is_custom && <Button variant="outline" className="rounded-sm" onClick={openSchema}><Settings2 className="w-4 h-4 mr-2" />Gestionar campos</Button>}
      </div>

      <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-6 mb-7">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary mb-2">{database.source}</p>
          <h1 className="font-heading text-4xl sm:text-5xl font-bold tracking-tight">{database.name}</h1>
          <p className="text-muted-foreground mt-2">{database.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="rounded-sm" disabled={exporting === "csv" || !database.record_count} onClick={() => download("csv")}>{exporting === "csv" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 mr-2" />}Exportar CSV</Button>
          <Button variant="outline" size="icon" className="rounded-sm" title="Descargar copia JSON" disabled={exporting === "json" || !database.record_count} onClick={() => download("json")}>{exporting === "json" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileJson className="w-4 h-4" />}</Button>
          <Button variant="outline" size="icon" className="rounded-sm" title="Actualizar datos" onClick={() => reload(page, search, filters)}><RefreshCw className="w-4 h-4" /></Button>
          <Button className="rounded-sm" onClick={openNew}><Plus className="w-4 h-4 mr-2" />Añadir registro</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card className="rounded-sm"><CardContent className="p-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">Registros</p><p className="font-heading text-4xl font-bold mt-2">{database.record_count}</p></CardContent></Card>
        <Card className="rounded-sm"><CardContent className="p-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">{database.is_custom ? "Estructura" : "Última importación"}</p><p className="font-medium mt-2">{database.is_custom ? `${database.fields.length} campos configurados` : database.last_import?.source_filename || "Sin importar"}</p>{!database.is_custom && <p className="text-xs text-muted-foreground mt-1">{database.last_import?.record_count || 0} registros</p>}</CardContent></Card>
      </div>

      <Card className="rounded-sm border-border">
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <CardTitle className="font-heading text-xl uppercase flex items-center gap-2"><Database className="w-5 h-5 text-primary" />Registros</CardTitle>
            <span className="text-sm text-muted-foreground">{total} resultados</span>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 mt-4">
            <div className="relative flex-1 max-w-xl">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9 rounded-sm" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === "Enter" && applyFilters()} placeholder="Buscar en todos los campos de texto..." />
            </div>
            <Button variant="outline" className="rounded-sm" onClick={applyFilters}><Search className="w-4 h-4 mr-2" />Aplicar filtros</Button>
            {(search || hasFilters(filters)) && <Button variant="ghost" className="rounded-sm" onClick={clearFilters}><X className="w-4 h-4 mr-2" />Limpiar</Button>}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-64 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : records.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center border border-dashed border-border"><Database className="w-8 h-8 text-muted-foreground mb-3" /><h2 className="font-heading text-xl font-bold">Aún no hay registros</h2><p className="text-sm text-muted-foreground mt-1">Añade el primer registro para comenzar.</p></div>
          ) : (
            <div className="overflow-x-auto border border-border">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-secondary/70 text-xs uppercase text-muted-foreground">
                  <tr>{database.fields.map((field) => <th key={field.key} className="text-left p-3">{field.label}</th>)}<th className="text-right p-3">Acciones</th></tr>
                  <tr className="border-t border-border normal-case">{database.fields.map((field) => <th key={field.key} className="p-2">{renderFilter(field)}</th>)}<th className="p-2 text-right"><Button variant="outline" size="icon" className="h-8 w-8 rounded-sm" title="Aplicar filtros de columnas" onClick={applyFilters}><Search className="w-3.5 h-3.5" /></Button></th></tr>
                </thead>
                <tbody>{records.map((record) => <tr key={record.id} className="border-t border-border odd:bg-background even:bg-muted/35 hover:bg-primary/5"><>{database.fields.map((field) => <td key={field.key} className="p-3 max-w-[280px] whitespace-pre-wrap">{formatValue(field, record.data?.[field.key])}</td>)}</><td className="p-3 text-right"><Button variant="ghost" size="icon" className="rounded-sm" title="Editar registro" onClick={() => openEdit(record)}><Pencil className="w-4 h-4" /></Button></td></tr>)}</tbody>
              </table>
            </div>
          )}
          <div className="flex items-center justify-between gap-4 mt-5"><span className="text-sm text-muted-foreground">Página {page} de {totalPages}</span><div className="flex gap-2"><Button variant="outline" className="rounded-sm" disabled={page <= 1 || loading} onClick={() => { const next = page - 1; setPage(next); reload(next, search, filters); }}>Anterior</Button><Button variant="outline" className="rounded-sm" disabled={page >= totalPages || loading} onClick={() => { const next = page + 1; setPage(next); reload(next, search, filters); }}>Siguiente</Button></div></div>
        </CardContent>
      </Card>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-3xl rounded-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Editar registro" : "Añadir registro"}</DialogTitle><DialogDescription>Completa los campos de esta base de datos.</DialogDescription></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-3">{database.fields.map((field) => <label key={field.key} className={field.type === "long_text" ? "sm:col-span-2" : ""}><span className="text-xs uppercase text-muted-foreground">{field.label}</span>{renderEditorField(field)}</label>)}</div>
          <DialogFooter><Button variant="outline" className="rounded-sm" onClick={() => setEditorOpen(false)}><X className="w-4 h-4 mr-2" />Cancelar</Button><Button className="rounded-sm" disabled={saving} onClick={save}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{editing ? "Guardar cambios" : "Crear registro"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={schemaOpen} onOpenChange={setSchemaOpen}>
        <DialogContent className="max-w-4xl rounded-sm max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-heading text-2xl">Gestionar campos</DialogTitle><DialogDescription>Añade campos o cambia sus nombres visibles. Los campos con datos quedan protegidos.</DialogDescription></DialogHeader>
          {schema && <div className="space-y-5 py-2"><label className="block"><span className="text-xs font-semibold uppercase text-muted-foreground">Nombre</span><Input className="mt-2 rounded-sm" value={schema.name} onChange={(event) => setSchema({ ...schema, name: event.target.value })} /></label><label className="block"><span className="text-xs font-semibold uppercase text-muted-foreground">Descripción</span><Textarea className="mt-2 rounded-sm" value={schema.description} onChange={(event) => setSchema({ ...schema, description: event.target.value })} /></label><DatabaseFieldsEditor fields={schema.fields} onChange={(fields) => setSchema({ ...schema, fields })} latestRowId={schema.latestRowId} onLatestChange={(latestRowId) => setSchema({ ...schema, latestRowId })} lockExisting={database.record_count > 0} /></div>}
          <DialogFooter><Button variant="outline" className="rounded-sm" onClick={() => setSchemaOpen(false)}><X className="w-4 h-4 mr-2" />Cancelar</Button><Button className="rounded-sm" disabled={schemaSaving} onClick={saveSchema}>{schemaSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Guardar estructura</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
