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
              <Route path="flujo/clasificar" element={<Editor workflowMode="classify" />} />
              <Route path="flujo/dudosas" element={<Editor workflowMode="review_doubtful" />} />
              <Route path="flujo/nombres" element={<Editor workflowMode="names" />} />
              <Route path="flujo/confirmar-nombres" element={<Editor workflowMode="confirm_names" />} />
              <Route path="flujo/duplicados-rapido" element={<Editor workflowMode="duplicates_fast" />} />
              <Route path="flujo/duplicados-ia" element={<Editor workflowMode="duplicates_ai" />} />
              <Route path="flujo/revisar-duplicados" element={<Editor workflowMode="review_duplicates" />} />
              <Route path="flujo/ortografia" element={<Editor workflowMode="spelling" />} />
              <Route path="flujo/reserva" element={<Editor workflowMode="reserve" />} />
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
