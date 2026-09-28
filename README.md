# Triage de Tickets

Agent harness de soporte: un mensaje crudo del cliente entra, un agente LLM lo
clasifica y extrae datos en JSON estricto, y un bucle de autocorrección garantiza
que **nada inválido llegue a la base**.

## Arquitectura

```
┌──────────────────┐         ┌──────────────────┐       ┌──────────────┐
│  Next.js 16      │  POST   │  FastAPI         │  ┌───▶│  Gemini      │
│  dashboard       │────────▶│  /api/triage     │──┘    │  free tier   │
│  (Supabase auth) │         │                  │        └──────────────┘
└──────────────────┘         │  ┌────────────┐  │
        ▲                    │  │  LangGraph │  │  ┌──────────────────┐
        │                    │  │  extract ──┼──┼─▶│ SQLite :memory:  │
        │ audit trail        │  │  validate ─┤  │  └──────────────────┘
        └────────────────────┤  │  finalize  │  │
             (CA 4.2)        │  └────────────┘  │
                              │  Pydantic schema │
                              └──────────────────┘
```

El frontend nunca habla con Gemini. La key vive solo en el backend.

## Estructura

```
triage/
├── backend/                  FastAPI + LangGraph + Pydantic
│   ├── app/
│   │   ├── models.py         ExtractedTicket, enums, regla de negocio (CA 2.3)
│   │   ├── prompts.py        system prompt + inyección del error (CA 3.1)
│   │   ├── llm.py            GeminiProvider / MockProvider
│   │   ├── graph.py          el bucle de autocorrección
│   │   ├── db.py             SQLite en memoria
│   │   ├── main.py           endpoints
│   │   └── env.py            carga .env
│   ├── tests/                37 tests
│   └── .env.example
└── frontend/                 Next.js 16 + Supabase
    ├── app/                  rutas
    ├── components/           dashboard, form, badges, audit trail, JSON
    ├── lib/                  tipos, cliente Supabase, auth
    ├── proxy.ts              gate de autenticación (FR-1)
    └── supabase/profiles.sql schema de auth
```

## Arranque

### 1. Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
copy .env.example .env        # completar GEMINI_API_KEY
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000
```

Para developear sin gastar cuota, poné `MOCK_LLM=true` en `.env`.

Tests: `.\.venv\Scripts\python.exe -m pytest -q`

### 2. Schema de Supabase

Corré `frontend/supabase/profiles.sql` en el SQL editor de Supabase. Crea la
tabla `profiles` con el flag `is_admin` y la política RLS.

### 3. Usuario

No hay signup público (spec R-15). Creá el usuario a mano:
**Authentication → Users → Add user**. Después corré:

```sql
update public.profiles
   set is_admin = true
 where id = (select id from auth.users where email = 'tu@email.com');
```

### 4. Frontend

```powershell
cd frontend
npm install
npm run dev
```

Va a `http://localhost:3000`.

## Variables de entorno

| Variable                              | Dónde    | Pública  |
| ------------------------------------- | -------- | -------- |
| `GEMINI_API_KEY`                      | backend  | **no**   |
| `GEMINI_MODEL`                        | backend  | no       |
| `MOCK_LLM`                            | backend  | no       |
| `NEXT_PUBLIC_SUPABASE_URL`            | frontend | sí       |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`| frontend | sí       |
| `NEXT_PUBLIC_API_URL`                 | frontend | sí       |

La publishable key de Supabase es pública por diseño. La `service_role` key no
aparece en ninguna variable de este proyecto: no debería existir en el cliente.

## Los tres estados terminales

| Estado               | Qué significa                                                     |
| -------------------- | ----------------------------------------------------------------- |
| `success`            | El ticket validó y se guardó. Puede Took `n` intentos.            |
| `needs_manual_review`| Se agotaron los reintentos. Nada se guardó.                        |
| `quota_exceeded`     | El free tier de Gemini se agotó. El harness está bien.            |

`quota_exceeded` no está en la spec original (sección 12 listaba 5 estados).
Se agregó durante el desarrollo: reintentar un 429 no sirve de nada porque la
cuota sigue agotada, así que cortar el loop y avisar es lo correcto. La API
responde 200 igual, para que el dashboard lo muestre como información y no como
error.

## Desviaciones de la spec

- **`quota_exceeded`**: estado nuevo, ver arriba.
- **Tests automatizados**: la spec dice que no hay (sección 15). Hay 37. El
  bucle de autocorrección es la parte que más fácil se rompe en silencio.
- **Accesibilidad**: la spec la dejó sin definir. El mínimo implementado es que
  el color nunca es el único indicador y que el foco de teclado sea visible.
- **Sin toggle funcional**: el toggle "mis ejecuciones / todas" existe en la UI
  para el admin pero no filtra datos, porque el backend no recibe el usuario.
  Faltó definir cómo se pasan las ejecuciones de un operador a otro.

## Límites del free tier

El free tier de Gemini se agota rápido. `check_quota.py` prueba si hay cuota
disponible:

```powershell
.\.venv\Scripts\python.exe check_quota.py
```

Los tickets viven en SQLite en memoria y **se pierden al recargar la página**
(spec, sección 11.3). Para una demo está bien; si vas a recargar en vivo,
cambialo.
