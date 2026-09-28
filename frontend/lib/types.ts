/** Shared types mirroring the backend Pydantic models. */

export const CATEGORIES = [
  "Facturación",
  "Técnico",
  "Cuenta",
  "Sugerencia",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const URGENCIES = ["Baja", "Media", "Alta", "Crítica"] as const;
export type Urgency = (typeof URGENCIES)[number];

export const CHANNELS = [
  { value: "email", label: "Email" },
  { value: "chat", label: "Chat" },
  { value: "phone", label: "Teléfono" },
  { value: "social", label: "Red social" },
  { value: "other", label: "Otro" },
] as const;

export interface ExtractedTicket {
  summary: string;
  category: Category;
  urgency: Urgency;
  requires_human_escalation: boolean;
  extracted_amount: number | null;
}

export interface AttemptLog {
  attempt: number;
  succeeded: boolean;
  error: string | null;
  ticket: ExtractedTicket | null;
}

export type RunStatus =
  | "success"
  | "needs_manual_review"
  | "quota_exceeded";

export interface RunResult {
  status: RunStatus;
  attempts: AttemptLog[];
  ticket: ExtractedTicket | null;
  customer_message: string;
  channel: string;
  max_retries: number;
  needs_manual_review: boolean;
  quota_exceeded: boolean;
  error: string | null;
  total_ms: number | null;
  runs_remaining: number | null;
}

export const PRESETS: { label: string; message: string }[] = [
  {
    label: "Cobro duplicado en tarjeta",
    message:
      "Hola, me cobraron dos veces la suscripción de marzo. El importe fue de 4999 pesos cada vez, pero en mi banco solo aparece un cargo. Quiero que me devuelvan uno de los cobros.",
  },
  {
    label: "Error 500 al hacer login",
    message:
      "No puedo iniciar sesión en la aplicación. Cuando cargo la página me sale un error 500 después de poner mi email y mi contraseña, que son correctos. Probé con Chrome y con Firefox.",
  },
  {
    label: "Sugerencia de nueva funcionalidad",
    message:
      "Me gustaría que se pudiera exportar el reporte de ventas en formato CSV. Ahora solo se puede ver en pantalla y es molesto tener que copiar los datos a una planilla a mano.",
  },
];

/** CA 1.1: 15 to 1000 characters, mirrored from the backend. */
export const MIN_MESSAGE_LENGTH = 15;
export const MAX_MESSAGE_LENGTH = 1000;
