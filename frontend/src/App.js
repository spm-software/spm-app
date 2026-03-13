import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Importador from "@/pages/Importador";
import Editor from "@/pages/Editor";
import Distribuidor from "@/pages/Distribuidor";
import Usuarios from "@/pages/Usuarios";
import Configuracion from "@/pages/Configuracion";
import Exportar from "@/pages/Exportar";

function App() {
  return (
    <div className="min-h-screen bg-background">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="importar" element={<Importador />} />
            <Route path="editor" element={<Editor />} />
            <Route path="distribuir" element={<Distribuidor />} />
            <Route path="usuarios" element={<Usuarios />} />
            <Route path="configuracion" element={<Configuracion />} />
            <Route path="exportar" element={<Exportar />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster position="bottom-right" richColors />
    </div>
  );
}

export default App;
