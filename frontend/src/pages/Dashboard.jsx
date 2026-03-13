import { useEffect, useState } from "react";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, Users, Inbox, Calendar } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function Dashboard() {
  const [stats, setStats] = useState({
    total_questions: 0,
    total_users: 0,
    total_batches: 0,
    recent_questions: 0
  });
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);

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
      setBatches(batchesRes.data.slice(0, 5));
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
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
    }
  ];

  if (loading) {
    return (
      <div className="p-8 md:p-12">
        <div className="animate-pulse space-y-8">
          <div className="h-10 w-64 bg-muted rounded" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1,2,3,4].map(i => (
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

      {/* Stats Grid - Bento Style */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12 stagger-children">
        {statCards.map((stat, index) => (
          <Card 
            key={stat.title} 
            className="bg-card border border-border rounded-sm hover:border-foreground/20 transition-colors"
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

      {/* Recent Batches */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="bg-card border border-border rounded-sm">
          <CardHeader>
            <CardTitle className="font-heading text-xl uppercase tracking-tight">
              LOTES RECIENTES
            </CardTitle>
          </CardHeader>
          <CardContent>
            {batches.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No hay lotes importados. Ve a "Importar" para comenzar.
              </p>
            ) : (
              <div className="space-y-3">
                {batches.map((batch) => (
                  <div 
                    key={batch.id}
                    className="flex items-center justify-between p-4 bg-secondary/50 rounded-sm"
                    data-testid={`batch-item-${batch.id}`}
                  >
                    <div>
                      <p className="font-mono text-sm">{batch.id.slice(0, 8)}...</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(batch.created_at).toLocaleDateString('es-ES')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{batch.question_count}</p>
                      <p className="text-xs text-muted-foreground">preguntas</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card className="bg-card border border-border rounded-sm">
          <CardHeader>
            <CardTitle className="font-heading text-xl uppercase tracking-tight">
              FLUJO DE TRABAJO
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { step: 1, title: "Importar comentarios", desc: "Pega los comentarios de YouTube" },
                { step: 2, title: "Corregir con IA", desc: "Corrección gramatical automática" },
                { step: 3, title: "Detectar duplicados", desc: "Encuentra preguntas repetidas" },
                { step: 4, title: "Distribuir en programas", desc: "Organiza en 4-5 programas" },
                { step: 5, title: "Exportar TXT", desc: "Genera el archivo final" },
              ].map((item) => (
                <div 
                  key={item.step}
                  className="flex items-start gap-4 p-3 rounded-sm hover:bg-secondary/50 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm flex-shrink-0">
                    {item.step}
                  </div>
                  <div>
                    <p className="font-medium text-sm">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
