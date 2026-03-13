import { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Settings, 
  Save, 
  Loader2,
  Cpu,
  Youtube,
  Hash
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function Configuracion() {
  const [settings, setSettings] = useState({
    num_programs: 4,
    max_questions_per_user_per_program: 2,
    llm_provider: "openai",
    youtube_client_id: "",
    youtube_client_secret: ""
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await axios.get(`${API}/settings`);
      setSettings(response.data);
    } catch (error) {
      console.error("Error fetching settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/settings`, settings);
      toast.success("Configuración guardada");
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error("Error al guardar configuración");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 md:p-12">
        <div className="animate-pulse space-y-8">
          <div className="h-10 w-64 bg-muted rounded" />
          <div className="h-64 bg-muted rounded-sm" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 md:p-12 animate-fade-in">
      {/* Header */}
      <div className="mb-12">
        <h1 className="font-heading text-4xl sm:text-5xl font-bold tracking-tight mb-2">
          CONFIGURACIÓN
        </h1>
        <p className="text-muted-foreground">
          Ajusta los parámetros del gestor de preguntas
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-4xl">
        {/* Distribution Settings */}
        <Card className="bg-card border border-border rounded-sm">
          <CardHeader>
            <CardTitle className="font-heading text-lg uppercase tracking-tight flex items-center gap-2">
              <Hash className="w-5 h-5 text-primary" />
              DISTRIBUCIÓN
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Número de programas por defecto
              </Label>
              <Select 
                value={settings.num_programs.toString()} 
                onValueChange={(v) => setSettings({...settings, num_programs: parseInt(v)})}
              >
                <SelectTrigger className="mt-2 rounded-sm" data-testid="default-programs-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 programas</SelectItem>
                  <SelectItem value="4">4 programas</SelectItem>
                  <SelectItem value="5">5 programas</SelectItem>
                  <SelectItem value="6">6 programas</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Máximo preguntas por usuario por programa
              </Label>
              <Select 
                value={settings.max_questions_per_user_per_program.toString()} 
                onValueChange={(v) => setSettings({...settings, max_questions_per_user_per_program: parseInt(v)})}
              >
                <SelectTrigger className="mt-2 rounded-sm" data-testid="max-questions-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 pregunta</SelectItem>
                  <SelectItem value="2">2 preguntas</SelectItem>
                  <SelectItem value="3">3 preguntas</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-2">
                Si un usuario tiene más preguntas, el exceso irá a Reserva
              </p>
            </div>
          </CardContent>
        </Card>

        {/* AI Settings */}
        <Card className="bg-card border border-border rounded-sm">
          <CardHeader>
            <CardTitle className="font-heading text-lg uppercase tracking-tight flex items-center gap-2">
              <Cpu className="w-5 h-5 text-primary" />
              CORRECCIÓN IA
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Proveedor de IA
              </Label>
              <Select 
                value={settings.llm_provider} 
                onValueChange={(v) => setSettings({...settings, llm_provider: v})}
              >
                <SelectTrigger className="mt-2 rounded-sm" data-testid="llm-provider-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI GPT-5.2</SelectItem>
                  <SelectItem value="anthropic">Claude Sonnet 4.5</SelectItem>
                  <SelectItem value="gemini">Gemini 3 Flash</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-2">
                Usando Emergent LLM Key universal
              </p>
            </div>
          </CardContent>
        </Card>

        {/* YouTube API Settings */}
        <Card className="bg-card border border-border rounded-sm lg:col-span-2">
          <CardHeader>
            <CardTitle className="font-heading text-lg uppercase tracking-tight flex items-center gap-2">
              <Youtube className="w-5 h-5 text-primary" />
              YOUTUBE API (OPCIONAL)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-sm text-muted-foreground">
              Configura las credenciales para acceder a comentarios directamente desde YouTube (función futura).
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Client ID
                </Label>
                <Input
                  value={settings.youtube_client_id || ""}
                  onChange={(e) => setSettings({...settings, youtube_client_id: e.target.value})}
                  placeholder="Tu Client ID de OAuth"
                  className="mt-2 rounded-sm font-mono text-sm"
                  data-testid="youtube-client-id-input"
                />
              </div>
              <div>
                <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Client Secret
                </Label>
                <Input
                  type="password"
                  value={settings.youtube_client_secret || ""}
                  onChange={(e) => setSettings({...settings, youtube_client_secret: e.target.value})}
                  placeholder="Tu Client Secret"
                  className="mt-2 rounded-sm font-mono text-sm"
                  data-testid="youtube-client-secret-input"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="lg:col-span-2">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="rounded-sm uppercase tracking-wide"
            data-testid="save-settings-button"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Guardar configuración
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
