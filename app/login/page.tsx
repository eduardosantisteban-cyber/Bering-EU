"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [conContrasena, setConContrasena] = useState(false);
  const next = searchParams.get("next") || "/";
  const errorGoogle = searchParams.get("error");
  const emailRechazado = searchParams.get("email");
  const MENSAJES: Record<string, string> = {
    "no-autorizado": `La cuenta ${emailRechazado || ""} no tiene acceso a Dársena. Pide a Eduardo que la añada.`,
    cancelado: "Se canceló el acceso con Google.",
    caducado: "El acceso tardó demasiado. Vuelve a intentarlo.",
    google: "Google no pudo confirmar tu cuenta. Vuelve a intentarlo.",
    config: "Falta configurar el acceso con Google (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET en Vercel).",
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        setError(b?.error || "Contraseña incorrecta");
        return;
      }
      router.replace(next);
      router.refresh();
    } catch {
      setError("No se pudo conectar. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f4f2] px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl border border-[#e2e0dc] bg-white p-8 shadow-sm"
      >
        <h1 className="mb-1 text-xl font-semibold text-[#282828]">
          Dársena · Bering EU
        </h1>
        <p className="mb-6 text-sm text-[#606060]">Entra con tu cuenta de trabajo de Google.</p>
        <a
          href={`/api/auth/google?next=${encodeURIComponent(next)}`}
          className="mb-3 flex w-full items-center justify-center gap-2.5 rounded-md border border-[#dadce0] bg-white px-3 py-2.5 text-sm font-medium text-[#282828] shadow-sm transition hover:bg-[#f8f8f8]"
        >
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.2l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" />
            <path fill="#FBBC05" d="M10.6 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.7 10.8l7.9-6.1z" />
            <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.8l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
          </svg>
          Entrar con Google
        </a>
        {errorGoogle && <p className="mb-3 text-sm text-[#e83038]">{MENSAJES[errorGoogle] || "No se pudo entrar con Google."}</p>}
        {!conContrasena ? (
          <button type="button" onClick={() => setConContrasena(true)} className="mt-1 w-full text-center text-xs text-[#8a8a8a] hover:text-[#282828]">
            Entrar con la contraseña del equipo
          </button>
        ) : (
          <>
        <p className="mb-2 mt-4 border-t border-[#efefec] pt-4 text-xs text-[#8a8a8a]">Contraseña del equipo (mientras dura la transición)</p>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Contraseña"
          className="mb-3 w-full rounded-md border border-[#e2e0dc] px-3 py-2 text-sm outline-none focus:border-[#e83038]"
        />
        {error && <p className="mb-3 text-sm text-[#e83038]">{error}</p>}
        <button
          type="submit"
          disabled={loading || !password}
          className="w-full rounded-md bg-[#e83038] px-3 py-2 text-sm font-medium text-white transition disabled:opacity-50"
        >
          {loading ? "Entrando…" : "Entrar"}
        </button>
          </>
        )}
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
