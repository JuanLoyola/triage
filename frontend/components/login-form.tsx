"use client";

import React from "react";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    setNotice(null);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setIsLoading(false);

    if (signInError) {
      // There is no public signup (R-15), so an unknown email is not a
      // distinct case for the operator: one message covers both.
      setError("Email o contraseña incorrectos.");
      return;
    }

    window.location.href = "/";
  }

  async function handlePasswordReset() {
    if (!email) {
      setError("Escribí tu email primero para recibir el link de recuperación.");
      return;
    }
    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });
    if (resetError) {
      setError("No pudimos enviar el email de recuperación.");
      return;
    }
    setNotice("Te enviamos un link de recuperación a tu correo.");
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="text-xl font-semibold text-slate-100">Triage de Tickets</h1>
      <p className="mt-1 mb-8 text-sm text-slate-400">Iniciá sesión para continuar.</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-200">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            className="w-full rounded-lg bg-slate-950/60 px-3 py-2 text-sm text-slate-100 ring-1 ring-slate-800 outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-200">
            Contraseña
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            className="w-full rounded-lg bg-slate-950/60 px-3 py-2 text-sm text-slate-100 ring-1 ring-slate-800 outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>

        {error ? (
          <p role="alert" className="text-xs text-red-400">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p role="status" className="text-xs text-sky-400">
            {notice}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isLoading}
          className="w-full rounded-lg bg-sky-500 px-4 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-sky-400 disabled:opacity-60"
        >
          {isLoading ? "Ingresando..." : "Ingresar"}
        </button>

        <button
          type="button"
          onClick={handlePasswordReset}
          className="w-full text-center text-xs text-slate-500 hover:text-slate-300"
        >
          ¿Olvidaste tu contraseña?
        </button>
      </form>
    </div>
  );
}
