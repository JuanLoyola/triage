# Triage de Tickets

Un mensaje crudo de un cliente entra por un formulario. Un agente LLM lo clasifica
(categoría, urgencia) y extrae datos estructurados en JSON estricto. La salida se valida
contra un esquema: si falla, el agente recibe el error exacto y se corrige solo, hasta un
límite de reintentos. Cuando se agotan, el ticket queda marcado para revisión manual y
**no se guarda nada**.

Lo interesante del proyecto no es la clasificación: es el harness alrededor. Todo el
esfuerzo está en garantizar que un ticket inválido nunca llegue a la base, y en hacer el
proceso visible para poder auditarlo.

---

## Qué hace

1. El usuario pega el mensaje que envió un cliente, o usa uno de los 3 presets.
2. El agente produce un JSON con `summary`, `category`, `urgency`,
   `requires_human_escalation` y `extracted_amount`.
3. Un validador Pydantic revisa el JSON contra el schema, más una regla de negocio: si la
   categoría es Facturación o la urgencia es Crítica, el summary no puede ser genérico.
4. Si algo falla, el error exacto vuelve al prompt y el agente reintenta.
5. El resultado se muestra con badges, el JSON con syntax highlighting, y el audit trail
   con cada intento y su error.

### El schema

```python
class ExtractedTicket(BaseModel):
    summary: str = Field(min_length=5)
    category: Category        # Facturación | Técnico | Cuenta | Sugerencia
    urgency: Urgency          # Baja | Media | Alta | Crítica
    requires_human_escalation: bool
    extracted_amount: float | None = None

    model_config = {"extra": "forbid"}
```

`extra: "forbid"` evita que el modelo smugglee campos que nunca llegarían a la base. Los
enums rechazan cualquier valor fuera de la lista, así que un `"Finanzas"` o un `"Urgente"`
saltan un `ValidationError` sin código extra.

---

## Cómo funciona

```
┌──────────────────┐        ┌────────────────────────┐        ┌───────────────┐
│  Next.js 16      │  POST  │  FastAPI               │        │  Gemini       │
│  dashboard       │───────▶│  POST /api/triage      │───────▶│  free tier    │
│  sin login       │        │                        │        └───────────────┘
└──────────────────┘        │   ┌──────────────────┐ │
         ▲                  │   │   LangGraph      │ │        ┌──────────────────┐
         │                  │   │                  │ │───────▶│ SQLite :memory: │
         │ audit trail      │   │ extract_ticket ──┼─┼──┐     │  se pierde al   │
         │                  │   │       ↺          │ │  │     │  reiniciar      │
         │                  │   │ validate_ticket ─┤ │  │     └──────────────────┘
         │                  │   │       ↺          │ │  │
         │                  │   │ finalize ────────┼─┘  │  ¿Pasó la validación?
         └──────────────────┤   └──────────────────┘ │   │
                              │                      └── sí ──▶ guardar
                              │  Pydantic + regla de negocio
                              │  max_retries configurable (1-5)
                              └────────────────────────┘
```

### El grafo

Tres nodos, con dos aristas condicionales:

- **`extract_ticket`** llama al LLM y parsea la salida. Si el JSON no parsea o no cumple
  el schema, registra un intento fallido y guarda el error.
- **`validate_ticket`** aplica la regla de negocio. Acá es donde se decide el veredicto del
  intento, porque un ticket puede pasar el schema y ser rechazado igual.
- **`finalize`** guarda si hubo ticket, o marca `NEEDS_MANUAL_REVIEW`.

El router después de `extract_ticket` **siempre** manda un ticket parseado a
`validate_ticket`. Ir directo a `finalize` saltearía la regla de negocio: es un bug que
existió y quedó cubierto por tests.

### La inyección del error

El mensaje de reintento incluye el error textual exacto:

```
Tu intento anterior falló con: 1 validation error for ExtractedTicket
category
  Input should be 'Facturación', 'Técnico', 'Cuenta' or 'Sugerencia'
```

El agente puede corregir el campo específico que falló en vez de adivinar.

### Los tres estados terminales

| Estado                | Significado                                        | Se guarda   |
| --------------------- | -------------------------------------------------- | ----------- |
| `success`             | El ticket validó. Puede haber Took varios intentos.  | Sí          |
| `needs_manual_review` | Se agotaron los reintentos                          | **No**      |
| `quota_exceeded`      | Se agotó el free tier de Gemini                     | **No**      |

`quota_exceeded` no estaba en el diseño original. Se agregó al ver que reintentar un 429
no sirve de nada: la cuota sigue agotada para todos los intentos siguientes. Cortar el loop
y avisar es lo correcto. La API responde 200 igual, para que la UI lo muestre como
información y no como error.

---

## Con qué herramientas está hecho

| Capa           | Elección                | Por qué                                                  |
| -------------- | ----------------------- | -------------------------------------------------------- |
| LLM            | Gemini 3.8 Flash        | Free tier, y `response_mime_type` para forzar JSON        |
| Orquestación   | LangGraph               | El grafo con reintentos condicionales es el núcleo        |
| Validación     | Pydantic v2             | `ValidationError` con el detalle exacto del campo         |
| API            | FastAPI + Uvicorn       | Async, y el `Depends` permite inyectar el LLM en tests   |
| Persistencia   | SQLite en memoria       | Suficiente para la demo, cero instalación                |
| Frontend       | Next.js 16 (Turbopack)  | App Router, y el build estático del dashboard             |
| Estilos        | Tailwind CSS v4         | El tema entero son variables CSS                          |
| Animaciones    | GSAP                    | Tweens con `context()` para limpieza automática           |
| Iconos         | lucide-react            | Un mismo set, peso y grid consistentes                    |
| Schema         | Zod                     | Valida el formulario en el cliente                        |
| Tests          | pytest + pytest-asyncio | 64 tests, sin requerir API key                             |

Sin base de datos externa, sin Docker, sin cuenta de pago. Todo corre en local con dos
terminales.

---

## Cómo lo desarrollamos

El proyecto no se escribió de una: salió de una **spec de 43 decisiones** que se construyó
por entrevista. Cada suposición del diseño tuvo que quedar anotada y aceptada, y varias
cambiaron sobre la marcha.

```
spec  ──▶ 43 asunciones ──▶ entrevista de una pregunta por turno
                            ──▶ 3 se reverse-engineeraron al implementar
                            ──▶ código
```

### Cambios de rumbo durante la implementación

| Decisión inicial | Qué pasó | Por qué |
| ---------------- | -------- | ------- |
| Auth con Supabase, roles operador/admin | Eliminado | Para una demo el login es una barrera. El límite pasó a ser por sesión de navegador |
| Límite por usuario | Por sesión | Sin login no hay identidad. Se agregó un techo global como red de seguridad |
| `needs_manual_review` como único fallo | Se agregó `quota_exceeded` | Reintentar un 429 no sirve |
| Tema oscuro | Light mode de bajo brillo | Para no cegar en salas iluminadas |
| SQLite en memoria | Se mantiene | Los tickets se pierden al reiniciar. Aceptado como límite consciente |
| Sin tests (según la spec) | 64 tests | El loop de autocorrección es lo que más fácil se rompe en silencio |

### Bugs que aparecieron y cómo se encontraron

Cuatro de ellos no se habrían visto leyendo el código:

1. **El router saltaba la regla de negocio.** Un ticket con categoría Facturación y
   summary genérico se guardaba sin pasar por el CA 2.3. Lo encontró un test que exigía
   que un summary genérico fuera rechazado.

2. **El contador del rate limit contaba dos veces.** `check_and_consume` insertaba una
   fila y el endpoint insertaba otra, así que el límite real era la mitad del declarado
   (2.5 de 3). Lo encontró el propio valor de `used` en la respuesta.

3. **El header de sesión no se leía.** `Annotated[..., Header()]` combinado con
   `from __future__ import annotations`: FastAPI no resolvía el header y tractaba todas
   las requests como sin sesión, así que todos los visitantes compartían un contador. Los
   58 tests unitarios pasaban porque testeaban la función, no el endpoint. Lo agarró un
   test a nivel HTTP.

4. **El trigger de Supabase rompía el alta de usuarios.** La tabla `profiles` ya existía
   con `email` y `name` como `NOT NULL`, y el trigger insertaba solo `id`. El error
   ("Database error creating new user") no señalaba al trigger.

### Un error de criterio mío

Durante la integración probé el login inventando una contraseña para la cuenta del
usuario. Fue un error de procedimiento: las credenciales no se inventan ni se prueban así.
El mismo comportamiento quedó verificado por un camino que no las requiere.

---

## Arrancar

### 1. Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
copy .env.example .env          # poner GEMINI_API_KEY
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000
```

Sin cuota: poné `MOCK_LLM=true` en `.env` y todo corre con un LLM falso que falla de
forma determinista, lo que permite ejercitar el loop de autocorrección sin gastar nada.

```powershell
.\.venv\Scripts\python.exe -m pytest -q      # 64 tests
.\.venv\Scripts\python.exe check_quota.py    # ¿queda cuota de Gemini?
```

### 2. Frontend

```powershell
cd frontend
npm install
npm run dev
```

Va a `http://localhost:3000`. Sin login, sin registro, sin base de datos.

### Variables de entorno

| Variable                 | Dónde   | Notes                                        |
| ------------------------ | ------- | -------------------------------------------- |
| `GEMINI_API_KEY`         | backend | Secreto. Nunca en el frontend                 |
| `GEMINI_MODEL`           | backend | Default `gemini-3.8-flash`                   |
| `MOCK_LLM`               | backend | `true` desactiva la llamada real              |
| `DAILY_RUN_LIMIT`        | backend | Ejecuciones por sesión, por día. Default 3    |
| `DAILY_GLOBAL_LIMIT`     | backend | Techo de toda la demo. Default 50             |
| `NEXT_PUBLIC_API_URL`    | frontend | Única variable que necesita el frontend      |

---

## Accesibilidad

No es un extra: es una restricción de diseño.

- **El color nunca es el único indicador.** La urgencia siempre aparece como texto junto
  al badge, para lectores de pantalla y para daltonismo.
- **Contraste verificado, no estimado.** `frontend/scripts/check-contrast.mjs` calcula los
  ratios WCAG reales de los 24 pares de color de la UI. Correrlo:

  ```powershell
  cd frontend
  node scripts/check-contrast.mjs
  ```

  El script ya encontró un color por debajo del mínimo AA. Falla con exit code 1 si algún
  par no llega a 4.5:1, así que sirve de regresión.

- **Light mode de bajo estrés.** Sin blanco puro ni negro puro: fondo `#f6f7f9` y texto
  `#1f2937` (13.7:1). El fondo blanco puro junto a texto oscuro es la causa principal de
  fatiga visual en salas iluminadas.

- **`prefers-reduced-motion` respetado.** Si el sistema pide reducir movimiento, no hay
  tweens de GSAP y las animaciones de fondo se cortan.

- **Foco de teclado visible** en todos los controles.

---

## Límites conocidos

No están escondidos. Son las decisiones que hacen que esto sea un MVP:

- **Los tickets se pierden al reiniciar el backend.** SQLite en memoria. Para una demo
  está bien; si vas a recargar en vivo, hay que cambiarlo.
- **El rate limit no es seguridad.** El id de sesión viene del cliente y se limpia con un
  click. Es una barrera contra el uso accidental, no contra alguien decidido. El techo
  global existe por eso.
- **La detección de "summary genérico" es una lista de frases.** Un LLM puede esquivarla
  con una frase que no esté en la lista. Para algo más robustos hace falta una evaluación
  semántica.
- **Sin tests de frontend.** Solo hay 2 componentes con lógica real y ninguno tiene
  estado complejo. El backend sí está cubierto.
- **El modelo se cambia solo.** Cuando Google deprecó `gemini-2.0-flash` la app dejó de
  funcionar sola. `check_quota.py` es la herramienta para diagnosticar eso rápido.
