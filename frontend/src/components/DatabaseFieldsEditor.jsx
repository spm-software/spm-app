import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const DATABASE_FIELD_TYPES = [
  { value: "text", label: "Texto corto" },
  { value: "long_text", label: "Texto largo" },
  { value: "number", label: "Número" },
  { value: "date", label: "Fecha" },
  { value: "email", label: "Correo" },
  { value: "phone", label: "Teléfono" },
  { value: "select", label: "Lista de opciones" },
];

export const createDatabaseField = (overrides = {}) => ({
  _rowId: crypto.randomUUID(),
  key: "",
  label: "",
  type: "text",
  options: [],
  ...overrides,
});

const fieldKey = (label) => label
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "_")
  .replace(/^_+|_+$/g, "") || "campo";

export const buildDatabaseFields = (fields) => {
  const used = new Set();
  return fields.map((field) => {
    const base = field.key || fieldKey(field.label);
    let key = base;
    let suffix = 2;
    while (used.has(key)) {
      key = `${base}_${suffix}`;
      suffix += 1;
    }
    used.add(key);
    return {
      key,
      label: field.label.trim(),
      type: field.type,
      options: field.type === "select" ? field.options : [],
      _rowId: field._rowId,
    };
  });
};

export default function DatabaseFieldsEditor({
  fields,
  onChange,
  latestRowId,
  onLatestChange,
  lockExisting = false,
}) {
  const updateField = (index, changes) => {
    onChange(fields.map((field, fieldIndex) => fieldIndex === index ? { ...field, ...changes } : field));
  };

  const moveField = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const removeField = (index) => {
    const removed = fields[index];
    const next = fields.filter((_, fieldIndex) => fieldIndex !== index);
    onChange(next);
    if (removed._rowId === latestRowId) onLatestChange("");
  };

  return (
    <div className="space-y-3">
      <div className="hidden md:grid grid-cols-[minmax(180px,1fr)_170px_130px_88px] gap-3 px-1 text-xs font-semibold uppercase text-muted-foreground">
        <span>Nombre del campo</span>
        <span>Tipo</span>
        <span>Numeración</span>
        <span className="text-right">Orden</span>
      </div>

      {fields.map((field, index) => {
        const protectedField = lockExisting && Boolean(field.key);
        return (
          <div key={field._rowId} className="border border-border bg-background p-3">
            <div className="grid grid-cols-1 md:grid-cols-[minmax(180px,1fr)_170px_130px_88px] gap-3 items-center">
              <Input
                value={field.label}
                onChange={(event) => updateField(index, { label: event.target.value })}
                placeholder="Ej.: Número, Tema, Fecha"
                className="rounded-sm"
              />
              <select
                value={field.type}
                disabled={protectedField}
                onChange={(event) => {
                  const type = event.target.value;
                  updateField(index, { type, options: type === "select" ? field.options : [] });
                  if (type !== "number" && field._rowId === latestRowId) onLatestChange("");
                }}
                className="h-9 w-full border border-input bg-background px-3 text-sm rounded-sm disabled:opacity-60"
              >
                {DATABASE_FIELD_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>
              <label className={`flex items-center gap-2 text-sm ${field.type === "number" ? "" : "text-muted-foreground"}`}>
                <input
                  type="radio"
                  name="latest-number-field"
                  checked={latestRowId === field._rowId}
                  disabled={field.type !== "number"}
                  onChange={() => onLatestChange(field._rowId)}
                />
                Último número
              </label>
              <div className="flex justify-end gap-1">
                <Button type="button" variant="ghost" size="icon" className="rounded-sm" disabled={index === 0} title="Subir campo" onClick={() => moveField(index, -1)}><ArrowUp className="w-4 h-4" /></Button>
                <Button type="button" variant="ghost" size="icon" className="rounded-sm" disabled={index === fields.length - 1} title="Bajar campo" onClick={() => moveField(index, 1)}><ArrowDown className="w-4 h-4" /></Button>
                <Button type="button" variant="ghost" size="icon" className="rounded-sm text-destructive" disabled={protectedField || fields.length === 1} title={protectedField ? "No se puede eliminar un campo que ya contiene datos" : "Eliminar campo"} onClick={() => removeField(index)}><Trash2 className="w-4 h-4" /></Button>
              </div>
            </div>
            {field.type === "select" && (
              <label className="block mt-3">
                <span className="text-xs uppercase text-muted-foreground">Opciones separadas por comas</span>
                <Input
                  className="mt-1 rounded-sm"
                  value={(field.options || []).join(", ")}
                  onChange={(event) => updateField(index, { options: event.target.value.split(",").map((option) => option.trim()).filter(Boolean) })}
                  placeholder="Ej.: Pendiente, En curso, Finalizado"
                />
              </label>
            )}
          </div>
        );
      })}

      <Button type="button" variant="outline" className="rounded-sm" onClick={() => onChange([...fields, createDatabaseField()])}>
        <Plus className="w-4 h-4 mr-2" />Añadir campo
      </Button>
    </div>
  );
}
