# Agente de voz: tu asistente de calendario

Proyecto del Master de Desarrollo Agentico (The Power). Hablas al navegador y el agente gestiona tu Google Calendar:
voz -> Whisper (local) -> intencion (llama3.1) -> accion (MCP -> Google Calendar) -> respuesta. Coste cero.

## Estado: Sesion 2 · El loop de voz

| Pieza | Donde | Estado |
|-------|-------|--------|
| Especificacion de las 5 etapas | `docs/ESPEC.md` | hecho |
| Whisper local (small, 16 kHz mono) | `stt/` | hecho: servicio en 127.0.0.1:8765 |
| Google Calendar (OAuth, calendario propio) | `src/lib/google.ts`, `src/app/api/` | hecho: eventos de hoy |
| Esquema de acciones (4, destructivas marcadas) | `src/lib/acciones.ts` | hecho y probado con llama3.1 |
| Servidor MCP del calendario | `mcp/servidor.ts` | esqueleto: anuncia las 4 tools |
| Captura de voz en el navegador | `src/components/BotonHablar.tsx` | hecho: getUserMedia + MediaRecorder (webm/opus) |
| Audio -> texto desde la app | `src/app/api/transcribir/` | hecho: FormData -> servicio de Whisper |
| Texto -> intencion (JSON) | `src/lib/intencion.ts`, `src/app/api/intencion/` | hecho: llama3.1 con el esquema de acciones |
| Respuesta en texto y voz | `src/lib/respuesta.ts` + SpeechSynthesis | hecho: sin tocar el calendario |
| Ejecutar via MCP, ambiguedad, contexto | | Sesion 3 |
| Confirmacion humana, guardarrailes, CI, despliegue | | Sesion 4 |

## Puesta en marcha

1. `npm install`
2. Whisper: un entorno de Python con `pip install -r stt/requirements.txt` y `python stt/servidor.py`
   (la primera vez descarga el modelo small, ~460 MB).
3. Ollama con `llama3.1` para probar el esquema: `node scripts/probar-acciones.ts "que tengo hoy"`.
4. Google Cloud (gratis): proyecto -> activar Google Calendar API -> Google Auth Platform (Interno si tienes
   Workspace; si no, Externo en modo prueba con tu cuenta como usuario de prueba) -> cliente OAuth "Aplicacion web"
   con el redirect `http://localhost:3000/api/google/callback`.
5. `cp .env.example .env.local` y pega GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET.
6. Arranca Whisper (`python stt/servidor.py`) y Ollama, luego `npm run dev`, abre http://localhost:3000 y pulsa "Conectar Google Calendar". La app guarda el token y crea su
   propio calendario "Agente de voz (demo)": es el unico que puede tocar (permiso `calendar.app.created`).
7. Opcional: `node --env-file=.env.local scripts/sembrar.ts` mete eventos de ejemplo.

## Comprobaciones

- `python stt/probar.py mi_audio.m4a --formato` transcribe un audio y ensena el formato antes y despues.
- `node --env-file=.env.local scripts/probar-permisos.ts` demo del permiso minimo (tu calendario principal: 404).
- `node scripts/probar-intencion.ts "frase" ...` el JSON de la intencion y la respuesta, sin tocar el calendario.
- `node scripts/probar-mcp.ts` y `python mcp/cliente_jsonrpc.py mcp/servidor.ts list` el MCP por dentro.

## El loop de voz (Sesion 2)

Pulsa **Hablar**, di la orden y pulsa **Parar** (corta solo a los 30 s). La pagina ensena, en cuanto llega, lo que
entendio Whisper, el JSON de la intencion y la respuesta, que ademas lee en voz alta el navegador (prefiere una voz
es-ES local: las "Online (Natural)" de Edge mandan el texto a Microsoft). El microfono exige HTTPS o localhost.
