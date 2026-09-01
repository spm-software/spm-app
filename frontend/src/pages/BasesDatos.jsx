import { useEffect, useState } from "react";
import axios from "axios";
import { Database, ExternalLink, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { API_BASE_URL as API } from "@/lib/api";

export default function BasesDatos() {
  const navigate = useNavigate();
  const [databases, setDatabases] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`${API}/spm-databases`)
      .then((response) => setDatabases(response.data))
      .catch(() => setDatabases([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 md:p-12 animate-fade-in">
      <div className="mb-10">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary mb-2">Archivo y memoria</p>
        <h1 className="font-heading text-4xl sm:text-5xl font-bold tracking-tight mb-3">BASES DE DATOS SPM</h1>
        <p className="text-muted-foreground max-w-2xl">Consulta y gestiona archivos históricos de la Asociación Teológica sin mezclarlos con el flujo de preguntas.</p>
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
                    <h2 className="font-heading text-2xl font-bold">{database.name}</h2>
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
    </div>
  );
}
