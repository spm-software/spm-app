import { useEffect, useState } from "react";
import axios from "axios";
import { Database, ExternalLink, Loader2, Plus, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import DatabaseFieldsEditor, { buildDatabaseFields, createDatabaseField } from "@/components/DatabaseFieldsEditor";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { API_BASE_URL as API } from "@/lib/api";

const initialDefinition = () => {
  const numberField = createDatabaseField({ label: "Número", type: "number" });
  return {
    name: "",
    description: "",
    fields: [numberField, createDatabaseField({ label: "Título" })],
    latestRowId: numberField._rowId,
  };
};

export default function BasesDatos() {
  const navigate = useNavigate();
  const [databases, setDatabases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [definition, setDefinition] = useState(initialDefinition);

  const loadDatabases = async () => {
    try {
      setDatabases((await axios.get(`${API}/spm-databases`)).data);
    } catch {
      setDatabases([]);
      toast.error("No se pudieron cargar las bases de datos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadDatabases(); }, []);

  const openCreate = () => {
    setDefinition(initialDefinition());
    setDialogOpen(true);
  };

  const createDatabase = async () => {
    const name = definition.name.trim();
    const validFields = definition.fields.filter((field) => field.label.trim());
    if (!name) return toast.error("Escribe el nombre de la base de datos");
    if (validFields.length !== definition.fields.length) return toast.error("Todos los campos deben tener nombre");
    if (!validFields.length) return toast.error("Añade al menos un campo");

    const fields = buildDatabaseFields(validFields);
    const latestField = fields.find((field) => field._rowId === definition.latestRowId);
    setCreating(true);
    try {
      const response = await axios.post(`${API}/spm-databases/custom`, {
        name,
        description: definition.description,
        fields: fields.map(({ _rowId, ...field }) => field),
        latest_number_field: latestField?.type === "number" ? latestField.key : null,
        sort_field: latestField?.key || fields[0].key,
      });
      toast.success(`Base de datos ${response.data.name} creada`);
      setDialogOpen(false);
      await loadDatabases();
      navigate(`/bases-de-datos/${response.data.id}`);
    } catch (error) {
      toast.error(error.response?.data?.detail || "No se pudo crear la base de datos");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="p-6 md:p-12 animate-fade-in">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-10">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary mb-2">Archivo y memoria</p>
          <h1 className="font-heading text-4xl sm:text-5xl font-bold tracking-tight mb-3">BASES DE DATOS SPM</h1>
          <p className="text-muted-foreground max-w-2xl">Consulta y gestiona archivos históricos de la Asociación Teológica sin mezclarlos con el flujo de preguntas.</p>
        </div>
        <Button className="rounded-sm shrink-0" onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" />NUEVA BASE DE DATOS
        </Button>
      </div>

      {loading ? (
        <div className="h-52 flex items-center justify-center border border-border bg-card"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 max-w-5xl">
          {databases.map((database) => (
            <Card key={database.id} className="rounded-sm border-border overflow-hidden">
              <CardContent className="p-6 flex flex-col sm:flex-row gap-6 sm:items-center sm:justify-between">
                <div className="flex gap-4">
                  <div className="w-12 h-12 flex items-center justify-center shrink-0 bg-primary/10 text-primary"><Database className="w-6 h-6" /></div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-heading text-2xl font-bold">{database.name}</h2>
                      {database.is_custom && <span className="bg-primary/10 px-2 py-1 text-[10px] font-semibold uppercase text-primary">Personalizada</span>}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{database.description}</p>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground mt-4">{database.record_count} registros activos · Origen: {database.source}</p>
                  </div>
                </div>
                <Button className="rounded-sm shrink-0" onClick={() => navigate(`/bases-de-datos/${database.id}`)}>
                  Abrir <ExternalLink className="w-4 h-4 ml-2" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto rounded-sm">
          <DialogHeader>
            <DialogTitle className="font-heading text-2xl">Nueva base de datos</DialogTitle>
            <DialogDescription>Define su nombre y los campos que utilizarás en cada registro.</DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <label className="block">
              <span className="text-xs font-semibold uppercase text-muted-foreground">Nombre</span>
              <Input className="mt-2 rounded-sm" value={definition.name} onChange={(event) => setDefinition({ ...definition, name: event.target.value })} placeholder="Ej.: Conferencias" autoFocus />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase text-muted-foreground">Descripción</span>
              <Textarea className="mt-2 rounded-sm" value={definition.description} onChange={(event) => setDefinition({ ...definition, description: event.target.value })} placeholder="Contenido y finalidad de esta base de datos" />
            </label>
            <div>
              <div className="mb-3">
                <h3 className="font-heading text-lg font-bold">Campos</h3>
                <p className="text-sm text-muted-foreground">Marca como “Último número” el campo que controla la numeración principal.</p>
              </div>
              <DatabaseFieldsEditor
                fields={definition.fields}
                onChange={(fields) => setDefinition({ ...definition, fields })}
                latestRowId={definition.latestRowId}
                onLatestChange={(latestRowId) => setDefinition({ ...definition, latestRowId })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-sm" onClick={() => setDialogOpen(false)}><X className="w-4 h-4 mr-2" />Cancelar</Button>
            <Button className="rounded-sm" disabled={creating} onClick={createDatabase}>{creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}Crear base de datos</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
