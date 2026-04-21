import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { Loader2 } from "lucide-react";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Importador from "@/pages/Importador";
import Editor from "@/pages/Editor";
import Distribuidor from "@/pages/Distribuidor";
import Usuarios from "@/pages/Usuarios";
import Configuracion from "@/pages/Configuracion";
import Exportar from "@/pages/Exportar";
import Login from "@/pages/Login";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";

const RequireAuth = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
};

function App() {
  return (
    <div className="min-h-screen bg-background">
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={
                <RequireAuth>
                  <Layout />
                </RequireAuth>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="importar" element={<Importador />} />
              <Route path="editor" element={<Editor />} />
              <Route path="distribuir" element={<Distribuidor />} />
              <Route path="usuarios" element={<Usuarios />} />
              <Route path="configuracion" element={<Configuracion />} />
              <Route path="exportar" element={<Exportar />} />
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
      <Toaster position="bottom-right" richColors />
    </div>
  );
}

export default App;
