/**
 * Triage form (CA 1.1 to 1.4).
 *
 * Owns the textarea, channel, max_retries, presets, and the isSubmitting state.
 * The 3 presets are fixed and overwrite the textarea (CA 1.4, spec EC-3).
 */
"use client";

import React from "react";
import { z } from "zod";
import {
  CHANNELS,
  MAX_MESSAGE_LENGTH,
  MIN_MESSAGE_LENGTH,
  PRESETS,
  type RunResult,
} from "@/lib/types";

/** CA 1.1: mirrors the backend constraint so the check is client side too. */
const messageSchema = z
  .string()
  .min(MIN_MESSAGE_LENGTH, "El mensaje debe tener al menos 15 caracteres.")
  .max(MAX_MESSAGE_LENGTH, "El mensaje no puede superar los 1000 caracteres.");

const MAX_RETRIES_OPTIONS = [1, 2, 3, 4, 5] as const;

interface Props {
  isSubmitting: boolean;
  onSubmit: (message: string, channel: string, maxRetries: number) => void;
  onDismissResult: () => void;
  result: RunResult | null;
  networkError: string | null;
}

export function TriageForm({
  isSubmitting,
  onSubmit,
  onDismissResult,
  result,
  networkError,
}: Props) {
  const [message, setMessage] = React.useState("");
  const [channel, setChannel] = React.useState<string>(CHANNELS[0].value);
  const [maxRetries, setMaxRetries] = React.useState<number>(3);
  const [messageError, setMessageError] = React.useState<string | null>(null);

  const messageLength = message.length;
  const trimmedLength = message.trim().length;
  const isValid = trimmedLength >= MIN_MESSAGE_LENGTH && trimmedLength <= MAX_MESSAGE_LENGTH;

  function validate(): boolean {
    const parsed = messageSchema.safeParse(message.trim());
    if (!parsed.success) {
      setMessageError(parsed.error.issues[0]?.message ?? "Mensaje inválido.");
      return false;
    }
    setMessageError(null);
    return true;
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isSubmitting) return;
    if (!validate()) return;
    onSubmit(message.trim(), channel, maxRetries);
  }

  function applyPreset(presetMessage: string) {
    setMessage(presetMessage);
    setMessageError(null);
  }

  // FR-24: the form clears after a successful run so the operator can send the
  // next message. Done by remounting from a `key` in the parent, not with an
  // effect: quota and manual-review runs keep the text because the operator
  // still needs it to act.

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <label htmlFor="customer-message" className="text-sm font-medium text-slate-200">
            Mensaje del cliente
          </label>
          <span
            className={`text-xs tabular-nums ${
              messageLength > MAX_MESSAGE_LENGTH ? "text-red-400" : "text-slate-500"
            }`}
          >
            {messageLength} / {MAX_MESSAGE_LENGTH}
          </span>
        </div>

        <textarea
          id="customer-message"
          value={message}
          onChange={(event) => {
            setMessage(event.target.value);
            if (messageError) setMessageError(null);
          }}
          rows={7}
          disabled={isSubmitting}
          placeholder="Pegá acá el mensaje que envió el cliente"
          aria-invalid={Boolean(messageError)}
          aria-describedby={messageError ? "message-error" : undefined}
          className={`w-full resize-y rounded-lg bg-slate-950/60 p-3 text-sm text-slate-100 placeholder-slate-600 ring-1 outline-none focus:ring-2 disabled:opacity-60 ${
            messageError
              ? "ring-red-500/60 focus:ring-red-500"
              : "ring-slate-800 focus:ring-sky-500"
          }`}
        />

        {messageError ? (
          <p id="message-error" role="alert" className="mt-1.5 text-xs text-red-400">
            {messageError}
          </p>
        ) : null}
      </div>

      <div>
        <span className="mb-2 block text-sm font-medium text-slate-200">Presets de prueba</span>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => applyPreset(preset.message)}
              disabled={isSubmitting}
              className="rounded-full bg-slate-800/70 px-3 py-1.5 text-xs text-slate-300 ring-1 ring-slate-700 transition hover:bg-slate-700/70 hover:text-slate-100 disabled:opacity-50"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="channel" className="mb-2 block text-sm font-medium text-slate-200">
            Canal de origen
          </label>
          <select
            id="channel"
            value={channel}
            onChange={(event) => setChannel(event.target.value)}
            disabled={isSubmitting}
            className="w-full rounded-lg bg-slate-950/60 px-3 py-2 text-sm text-slate-100 ring-1 ring-slate-800 outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-60"
          >
            {CHANNELS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="max-retries" className="mb-2 block text-sm font-medium text-slate-200">
            Máximo de reintentos
          </label>
          <select
            id="max-retries"
            value={maxRetries}
            onChange={(event) => setMaxRetries(Number(event.target.value))}
            disabled={isSubmitting}
            className="w-full rounded-lg bg-slate-950/60 px-3 py-2 text-sm text-slate-100 ring-1 ring-slate-800 outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-60"
          >
            {MAX_RETRIES_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>

      {networkError ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-lg bg-red-500/10 p-3 text-sm text-red-200 ring-1 ring-red-500/30"
        >
          <span>{networkError}</span>
          <button
            type="button"
            onClick={() => validate() && onSubmit(message.trim(), channel, maxRetries)}
            className="shrink-0 rounded bg-red-500/20 px-2.5 py-1 text-xs font-medium hover:bg-red-500/30"
          >
            Reintentar
          </button>
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isSubmitting || !isValid}
          className="rounded-lg bg-sky-500 px-5 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
        >
          {isSubmitting ? "Procesando..." : "Enviar"}
        </button>

        {result && !isSubmitting ? (
          <button
            type="button"
            onClick={onDismissResult}
            className="text-sm text-slate-400 underline-offset-4 hover:text-slate-200 hover:underline"
          >
            Limpiar resultado
          </button>
        ) : null}
      </div>
    </form>
  );
}
