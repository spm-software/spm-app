import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  MessageSquare, 
  Users, 
  Inbox, 
  Calendar,
  ChevronRight,
  Trash2,
  Edit3,
  Layers,
  Download,
  Pencil,
  Check,
  X,
  Upload,
  Filter,
  Copy,
  Wand2,
  ClipboardCheck
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { API_BASE_URL as API } from "@/lib/api";

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    total_questions: 0,
    total_users: 0,
    total_batches: 0,
    recent_questions: 0,
    reserve_questions: 0
  });
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingDateId, setEditingDateId] = useState(null);
  const [editingDateValue, setEditingDateValue] = useState("");
  const [editingNameId, setEditingNameId] = useState(null);
  const [editingNameValue, setEditingNameValue] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [statsRes, batchesRes] = await Promise.all([
        axios.get(`${API}/stats`),
        axios.get(`${API}/batches`)
      ]);
      setStats(statsRes.data);
      setBatches(batchesRes.data);
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteBatch = async (batchId) => {
    try {
      await axios.delete(`${API}/batches/${batchId}`);
      toast.success("Lote eliminado");
      fetchData();
    } catch (error) {
      console.error("Error deleting batch:", error);
      toast.error("Error al eliminar lote");
    }
  };

  const handleEditDate = (batch) => {
    // Format date for input type="date"
    const date = new Date(batch.created_at);
    setEditingDateValue(date.toISOString().split('T')[0]);
    setEditingDateId(batch.id);
  };

  const handleSaveDate = async (batchId) => {
    try {
      await axios.put(`${API}/batches/${batchId}`, {
        created_at: new Date(editingDateValue).toISOString()
      });
      toast.success("Fecha actualizada");
      setEditingDateId(null);
      fetchData();
    } catch (error) {
      console.error("Error updating date:", error);
      toast.error("Error al actualizar fecha");
    }
  };

  const handleCancelEdit = () => {
    setEditingDateId(null);
    setEditingDateValue("");
  };

  const handleEditName = (batch) => {
    setEditingNameValue(batch.name || "");
    setEditingNameId(batch.id);
  };

  const handleSaveName = async (batchId) => {
    try {
      await axios.put(`${API}/batches/${batchId}`, {
        name: editingNameValue
      });
      toast.success("Nombre actualizado");
      setEditingNameId(null);
      fetchData();
    } catch (error) {
      console.error("Error updating name:", error);
      toast.error("Error al actualizar nombre");
    }
  };

  const handleCancelNameEdit = () => {
    setEditingNameId(null);
    setEditingNameValue("");
  };

  const handleGoToEditor = (batchId) => {
    // Store selected batch in sessionStorage and navigate
    sessionStorage.setItem('selectedBatch', batchId);
    navigate('/editor');
  };

  const handleGoToReserve = () => {
    sessionStorage.removeItem('selectedBatch');
    sessionStorage.setItem('editorAssignmentFilter', 'reserve');
    sessionStorage.setItem('editorGlobalReserve', 'true');
    navigate('/editor');
  };

  const handleGoToDistribuir = (batchId) => {
    sessionStorage.setItem('selectedBatch', batchId);
    navigate('/distribuir');
  };

  const handleGoToExportar = (batchId) => {
    sessionStorage.setItem('selectedBatch', batchId);
    navigate('/exportar');
  };

  const statCards = [
    {
      title: "PREGUNTAS TOTALES",
      value: stats.total_questions,
      icon: MessageSquare,
      description: "En la base de datos"
    },
    {
      title: "USUARIOS",
      value: stats.total_users,
      icon: Users,
      description: "Con nombre real registrado"
    },
    {
      title: "LOTES IMPORTADOS",
      value: stats.total_batches,
      icon: Inbox,
      description: "Importaciones realizadas"
    },
    {
      title: "ÚLTIMOS 30 DÍAS",
      value: stats.recent_questions,
      icon: Calendar,
      description: "Preguntas recientes"
    },
    {
      title: "EN RESERVA",
      value: stats.reserve_questions || 0,
      icon: Layers,
      description: "Pulsa para verlas",
      onClick: handleGoToReserve
    }
  ];

  if (loading) {
    return (
      <div className="p-8 md:p-12">
        <div className="animate-pulse space-y-8">
          <div className="h-10 w-64 bg-muted rounded" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="h-32 bg-muted rounded-sm" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 md:p-12 animate-fade-in">
      {/* Header */}
      <div className="mb-12">
        <h1 className="font-heading text-4xl sm:text-5xl font-bold tracking-tight mb-2">
          DASHBOARD
        </h1>
        <p className="text-muted-foreground">
          Resumen de tu gestión de preguntas y respuestas
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-12 stagger-children">
        {statCards.map((stat, index) => (
          <Card 
            key={stat.title} 
            className={`bg-card border border-border rounded-sm hover:border-foreground/20 transition-colors ${
              stat.onClick ? "cursor-pointer" : ""
            }`}
            onClick={stat.onClick}
            data-testid={`stat-card-${index}`}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <stat.icon className="w-5 h-5 text-primary" strokeWidth={1.5} />
              </div>
            </CardHeader>
            <CardContent>
              <p className="font-heading text-4xl font-bold">{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Batches Section */}
      <div className="mb-8">
        <h2 className="font-heading text-2xl font-bold tracking-tight mb-6">
          IMPORTACIONES
        </h2>
        
        {batches.length === 0 ? (
          <Card className="bg-card border border-border rounded-sm">
            <CardContent className="py-12 text-center">
              <Inbox className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-heading text-xl mb-2">SIN IMPORTACIONES</h3>
              <p className="text-muted-foreground text-sm mb-4">
                No hay lotes importados. Ve a "Importar" para comenzar.
              </p>
              <Button onClick={() => navigate('/importar')} className="rounded-sm">
                Ir a Importar
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {batches.map((batch) => (
              <Card 
                key={batch.id}
                className="bg-card border border-border rounded-sm hover:border-primary/50 transition-all group"
                data-testid={`batch-card-${batch.id}`}
              >
                <CardContent className="p-5">
                  {/* Batch Header - Name */}
                  <div className="mb-2">
                    {editingNameId === batch.id ? (
                      <div className="flex items-center gap-2">
                        <Input
                          type="text"
                          value={editingNameValue}
                          onChange={(e) => setEditingNameValue(e.target.value)}
                          placeholder="Nombre de la importación..."
                          className="h-8 flex-1 rounded-sm text-sm"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveName(batch.id);
                            if (e.key === 'Escape') handleCancelNameEdit();
                          }}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSaveName(batch.id)}
                          className="h-8 w-8 p-0 text-green-600"
                        >
                          <Check className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleCancelNameEdit}
                          className="h-8 w-8 p-0 text-muted-foreground"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleEditName(batch)}
                        className="group/name flex items-center gap-2 hover:bg-secondary/50 rounded px-1 -ml-1 transition-colors w-full text-left"
                      >
                        <p className="font-heading text-lg font-bold truncate">
                          {batch.name || "Sin nombre"}
                        </p>
                        <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover/name:opacity-100 transition-opacity flex-shrink-0" />
                      </button>
                    )}
                  </div>

                  {/* Batch Date */}
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      {editingDateId === batch.id ? (
                        <div className="flex items-center gap-2">
                          <Input
                            type="date"
                            value={editingDateValue}
                            onChange={(e) => setEditingDateValue(e.target.value)}
                            className="h-8 w-40 rounded-sm text-sm"
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSaveDate(batch.id)}
                            className="h-8 w-8 p-0 text-green-600"
                          >
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleCancelEdit}
                            className="h-8 w-8 p-0 text-muted-foreground"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleEditDate(batch)}
                          className="group/date flex items-center gap-2 hover:bg-secondary/50 rounded px-1 -ml-1 transition-colors"
                        >
                          <p className="text-sm text-muted-foreground">
                            {new Date(batch.created_at).toLocaleDateString('es-ES', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric'
                            })}
                          </p>
                          <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover/date:opacity-100 transition-opacity" />
                        </button>
                      )}
                      <p className="text-xs text-muted-foreground font-mono mt-1">
                        {batch.id.slice(0, 8)}...
                      </p>
                    </div>
                    {batch.is_classified ? (
                      <Badge variant="secondary" className="text-sm" data-testid={`batch-preguntas-${batch.id}`}>
                        {batch.preguntas_confirmadas ?? 0} preguntas confirmadas
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-sm text-orange-600 border-orange-400 bg-orange-50"
                        data-testid={`batch-preguntas-${batch.id}`}
                      >
                        {batch.question_count} comentarios (sin clasificar)
                      </Badge>
                    )}
                  </div>

                  {/* Status */}
                  <div className="flex items-center gap-2 mb-4">
                    {batch.is_distributed ? (
                      <Badge variant="outline" className="text-xs text-green-600 border-green-500">
                        Distribuido
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-yellow-600 border-yellow-500">
                        Sin distribuir
                      </Badge>
                    )}
                    {batch.num_programs && (
                      <Badge variant="outline" className="text-xs">
                        {batch.num_programs} programas
                      </Badge>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 pt-4 border-t border-border">
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => handleGoToEditor(batch.id)}
                      className="rounded-sm text-xs flex-1"
                    >
                      <Edit3 className="w-3.5 h-3.5 mr-1" />
                      Editar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleGoToDistribuir(batch.id)}
                      className="rounded-sm text-xs"
                    >
                      <Layers className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleGoToExportar(batch.id)}
                      className="rounded-sm text-xs"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="rounded-sm text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>¿Eliminar este lote?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Se eliminarán todas las preguntas y programas asociados a este lote.
                            Esta acción no se puede deshacer.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={() => handleDeleteBatch(batch.id)}
                            className="bg-destructive hover:bg-destructive/90"
                          >
                            Eliminar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Quick Workflow */}
      <Card className="bg-card border border-border rounded-sm">
        <CardHeader>
          <CardTitle className="font-heading text-xl uppercase tracking-tight">
            FLUJO DE TRABAJO
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { step: 1, title: "Importar", desc: "Cargar comentarios", path: "/importar", icon: Upload },
              { step: 2, title: "Nombres", desc: "Resolver autores", path: "/editor", icon: Users },
              { step: 3, title: "Clasificar", desc: "Separar saludos", path: "/editor", icon: Filter },
              { step: 4, title: "Duplicados", desc: "Buscar y revisar", path: "/editor", icon: Copy },
              { step: 5, title: "Ortografía", desc: "Corregir preguntas", path: "/editor", icon: Wand2 },
              { step: 6, title: "Reserva", desc: "Revisar pendientes", action: handleGoToReserve, icon: Inbox },
              { step: 7, title: "Distribuir", desc: "Crear programas", path: "/distribuir", icon: Layers },
              { step: 8, title: "Revisar", desc: "Ajustar selección", path: "/editor", icon: ClipboardCheck },
              { step: 9, title: "Exportar", desc: "TXT y PNG", path: "/exportar", icon: Download },
            ].map((item) => (
              <button
                key={item.step}
                onClick={() => item.action ? item.action() : navigate(item.path)}
                className="flex items-center gap-3 p-4 rounded-sm border border-border hover:bg-secondary/50 transition-colors text-left"
              >
                <div className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold flex-shrink-0">
                  {item.step}
                </div>
                <item.icon className="w-5 h-5 text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
                <div className="min-w-0">
                  <p className="font-medium truncate">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground ml-auto" />
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
