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
  Hash,
  MessageSquareText,
  Repeat,
  Send,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
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

const FIELD =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 " +
  "outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-200 disabled:bg-slate-50 disabled:text-slate-500";

interface Props {
  isSubmitting: boolean;
  onSubmit: (message: string, channel: string, maxRetries: number) => void;
  onDismissResult: () => void;
  result: RunResult | null;
  networkError: string | null;
  isExhausted: boolean;
}

export function TriageForm({
  isSubmitting,
  onSubmit,
  onDismissResult,
  result,
  networkError,
  isExhausted,
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
    if (isSubmitting || isExhausted) return;
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
          <label htmlFor="customer-message" className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
            <MessageSquareText aria-hidden="true" className="h-4 w-4 text-slate-400" />
            Mensaje del cliente
          </label>
          <span
            className={`text-xs tabular-nums ${
              messageLength > MAX_MESSAGE_LENGTH ? "text-red-600" : "text-slate-500"
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
          className={`w-full resize-y rounded-lg border p-3 text-sm leading-relaxed text-slate-800 placeholder-slate-400 outline-none focus:ring-2 disabled:bg-slate-50 ${
            messageError
              ? "border-red-400 focus:border-red-500 focus:ring-red-100"
              : "border-slate-200 focus:border-sky-600 focus:ring-sky-100"
          }`}
        />

        {messageError ? (
          <p id="message-error" role="alert" className="mt-1.5 text-xs text-red-600">
            {messageError}
          </p>
        ) : null}
      </div>

      <div>
        <span className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-700">
          <Sparkles aria-hidden="true" className="h-4 w-4 text-slate-400" />
          Presets de prueba
        </span>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => applyPreset(preset.message)}
              disabled={isSubmitting}
              className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs text-slate-700 transition hover:bg-slate-200 hover:text-slate-800 disabled:opacity-50"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="channel" className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-700">
            <MessageSquareText aria-hidden="true" className="h-4 w-4 text-slate-400" />
            Canal de origen
          </label>
          <select
            id="channel"
            value={channel}
            onChange={(event) => setChannel(event.target.value)}
            disabled={isSubmitting}
            className={FIELD}
          >
            {CHANNELS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="max-retries" className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-700">
            <Repeat aria-hidden="true" className="h-4 w-4 text-slate-400" />
            Máximo de reintentos
          </label>
          <select
            id="max-retries"
            value={maxRetries}
            onChange={(event) => setMaxRetries(Number(event.target.value))}
            disabled={isSubmitting}
            className={FIELD}
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
          className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900"
        >
          <span className="flex items-center gap-2">
            <TriangleAlert aria-hidden="true" className="h-4 w-4 shrink-0" />
            {networkError}
          </span>
          <button
            type="button"
            onClick={() => validate() && onSubmit(message.trim(), channel, maxRetries)}
            className="flex shrink-0 items-center gap-1.5 rounded border border-red-300 bg-red-100 px-2.5 py-1 text-xs font-medium text-red-900 hover:bg-red-200"
          >
            <Repeat aria-hidden="true" className="h-3 w-3" />
            Reintentar
          </button>
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isSubmitting || !isValid || isExhausted}
          className="flex items-center gap-2 rounded-lg bg-sky-700 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
        >
          {isSubmitting ? (
            <Hash aria-hidden="true" className="h-4 w-4 animate-pulse" />
          ) : (
            <Send aria-hidden="true" className="h-4 w-4" />
          )}
          {isSubmitting ? "Procesando..." : isExhausted ? "Sin ejecuciones" : "Enviar"}
        </button>

        {result && !isSubmitting ? (
          <button
            type="button"
            onClick={onDismissResult}
            className="text-sm text-slate-500 underline-offset-4 hover:text-slate-700 hover:underline"
          >
            Limpiar resultado
          </button>
        ) : null}
      </div>
    </form>
  );
}
