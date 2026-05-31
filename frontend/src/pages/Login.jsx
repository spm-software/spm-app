import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, LogIn, ShieldAlert } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading, login } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Redirect if already authenticated
  useEffect(() => {
    if (!loading && user) {
      navigate("/", { replace: true });
    }
  }, [user, loading, navigate]);

  // Handle OAuth callback: when ?code=... arrives, exchange it
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const code = params.get("code");
    const oauthError = params.get("error");
    
    if (oauthError) {
      setError(`Google devolvió un error: ${oauthError}`);
      window.history.replaceState({}, "", "/login");
      return;
    }
    
    if (code) {
      (async () => {
        setSubmitting(true);
        try {
          const redirectUri = `${window.location.origin}/login`;
          const res = await axios.post(`${API}/auth/google-callback`, {
            code,
            redirect_uri: redirectUri,
          });
          login(res.data.token, res.data.user);
          toast.success(`Bienvenido, ${res.data.user.name || res.data.user.email}`);
          window.history.replaceState({}, "", "/login");
          navigate("/", { replace: true });
        } catch (err) {
          const status = err?.response?.status;
          const detail = err?.response?.data?.detail || err.message;
          if (status === 403) {
            setError(detail);
          } else {
            setError(`Error al iniciar sesión: ${detail}`);
          }
          window.history.replaceState({}, "", "/login");
        } finally {
          setSubmitting(false);
        }
      })();
    }
  }, [location.search, login, navigate]);

  const handleGoogleLogin = async () => {
    setError("");
    setSubmitting(true);
    try {
      const redirectUri = `${window.location.origin}/login`;
      const res = await axios.get(`${API}/auth/google-url`, {
        params: { redirect_uri: redirectUri },
      });
      window.location.href = res.data.auth_url;
    } catch (err) {
      console.error(err);
      toast.error("No se pudo iniciar sesión con Google");
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md rounded-sm border border-border">
        <CardHeader className="text-center">
          <div className="mx-auto w-14 h-14 rounded-sm bg-primary/10 flex items-center justify-center mb-4">
            <LogIn className="w-7 h-7 text-primary" />
          </div>
          <CardTitle className="font-heading text-2xl uppercase tracking-tight">
            Gestor de Preguntas
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-2">
            Inicia sesión con tu cuenta autorizada de Google
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div
              className="p-4 bg-red-50 border border-red-200 rounded-sm flex items-start gap-3"
              data-testid="login-error"
            >
              <ShieldAlert className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-900">Acceso denegado</p>
                <p className="text-xs text-red-700 mt-1">{error}</p>
              </div>
            </div>
          )}

          <Button
            onClick={handleGoogleLogin}
            disabled={submitting}
            className="w-full rounded-sm uppercase tracking-wide"
            size="lg"
            data-testid="google-login-button"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Procesando...
              </>
            ) : (
              <>
                <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Entrar con Google
              </>
            )}
          </Button>

          <p className="text-xs text-muted-foreground text-center pt-2">
            Solo la cuenta autorizada puede acceder.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
