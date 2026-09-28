"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * OAuth landing route.
 *
 * Supabase redirects the browser here with the result in the URL. This reads
 * it, stores the session, and scrubs the URL so credentials do not linger in
 * the address bar or in history.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = React.useState("Ingresando…");

  React.useEffect(() => {
    const supabase = createClient();

    async function complete() {
      const hash = new URLSearchParams(window.location.hash.slice(1));

      // Implicit flow: tokens arrive in the fragment.
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");

      // PKCE flow: a code arrives in the query string.
      const code = new URLSearchParams(window.location.search).get("code");

      if (!accessToken && !code) {
        setMessage("No pudimos completar el inicio de sesión.");
        return;
      }

      const { error } = code
        ? await supabase.auth.exchangeCodeForSession(code)
        : await supabase.auth.setSession({
            access_token: accessToken!,
            refresh_token: refreshToken!,
          });

      if (error) {
        setMessage(`No pudimos completar el inicio de sesión: ${error.message}`);
        return;
      }

      // Scrub the tokens before navigating.
      window.history.replaceState({}, "", window.location.pathname);
      router.replace("/");
      router.refresh();
    }

    void complete();
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <p role="status" className="text-sm text-slate-600">
        {message}
      </p>
    </div>
  );
}
