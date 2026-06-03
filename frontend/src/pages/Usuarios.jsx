import { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Users, 
  Plus, 
  Trash2, 
  Search,
  Save,
  Loader2
} from "lucide-react";
import { API_BASE_URL as API } from "@/lib/api";

export default function Usuarios() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newRealName, setNewRealName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await axios.get(`${API}/users`);
      setUsers(response.data);
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async () => {
    if (!newUsername.trim() || !newRealName.trim()) {
      toast.error("Completa ambos campos");
      return;
    }

    setSaving(true);
    try {
      await axios.post(`${API}/users`, {
        youtube_username: newUsername.startsWith("@") ? newUsername : `@${newUsername}`,
        real_name: newRealName
      });
      toast.success("Usuario añadido");
      setNewUsername("");
      setNewRealName("");
      fetchUsers();
    } catch (error) {
      console.error("Error adding user:", error);
      toast.error("Error al añadir usuario");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async (userId) => {
    try {
      await axios.delete(`${API}/users/${userId}`);
      toast.success("Usuario eliminado");
      fetchUsers();
    } catch (error) {
      console.error("Error deleting user:", error);
      toast.error("Error al eliminar usuario");
    }
  };

  const filteredUsers = users.filter(user => 
    user.youtube_username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.real_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-8 md:p-12 animate-fade-in">
      {/* Header */}
      <div className="mb-12">
        <h1 className="font-heading text-4xl sm:text-5xl font-bold tracking-tight mb-2">
          USUARIOS
        </h1>
        <p className="text-muted-foreground">
          Asocia nombres de usuario de YouTube con nombres reales
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Add User Form */}
        <Card className="bg-card border border-border rounded-sm lg:col-span-1">
          <CardHeader>
            <CardTitle className="font-heading text-lg uppercase tracking-tight flex items-center gap-2">
              <Plus className="w-5 h-5 text-primary" />
              AÑADIR USUARIO
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground block mb-2">
                Usuario de YouTube
              </label>
              <Input
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="@usuario123"
                className="rounded-sm font-mono"
                data-testid="new-username-input"
              />
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground block mb-2">
                Nombre Real
              </label>
              <Input
                value={newRealName}
                onChange={(e) => setNewRealName(e.target.value)}
                placeholder="Juan García"
                className="rounded-sm"
                data-testid="new-realname-input"
              />
            </div>
            <Button
              onClick={handleAddUser}
              disabled={saving || !newUsername.trim() || !newRealName.trim()}
              className="w-full rounded-sm uppercase tracking-wide"
              data-testid="add-user-button"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Guardar
            </Button>

            <div className="pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground">
                Al guardar un usuario, sus preguntas futuras mostrarán automáticamente su nombre real en lugar del username de YouTube.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Users List */}
        <Card className="bg-card border border-border rounded-sm lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="font-heading text-lg uppercase tracking-tight flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                USUARIOS REGISTRADOS
              </CardTitle>
              <span className="text-sm text-muted-foreground">
                {users.length} usuarios
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {/* Search */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar usuarios..."
                className="pl-10 rounded-sm"
                data-testid="search-users-input"
              />
            </div>

            <ScrollArea className="h-[500px]">
              {loading ? (
                <div className="py-8 text-center">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Cargando...</p>
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="py-8 text-center">
                  <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-sm text-muted-foreground">
                    {searchTerm ? "No se encontraron usuarios" : "No hay usuarios registrados"}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredUsers.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center justify-between p-4 bg-secondary/30 rounded-sm group hover:bg-secondary/50 transition-colors"
                      data-testid={`user-item-${user.id}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="font-bold text-primary">
                            {user.real_name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium">{user.real_name}</p>
                          <p className="text-xs text-muted-foreground font-mono">
                            {user.youtube_username}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteUser(user.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                        data-testid={`delete-user-${user.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
