# Agente de voz: tu asistente de calendario

Proyecto del Master de Desarrollo Agentico (The Power). Hablas al navegador y el agente gestiona tu Google Calendar:
voz -> Whisper (local) -> intencion (llama3.1) -> accion (MCP -> Google Calendar) -> respuesta. Coste cero.

## Estado: Sesion 1 · Arquitectura y especificaciones

| Pieza | Donde | Estado |
|-------|-------|--------|
| Especificacion de las 5 etapas | `docs/ESPEC.md` | hecho |
| Whisper local (small, 16 kHz mono) | `stt/` | hecho: servicio en 127.0.0.1:8765 |
| Google Calendar (OAuth, calendario propio) | `src/lib/google.ts`, `src/app/api/` | hecho: eventos de hoy |
| Esquema de acciones (4, destructivas marcadas) | `src/lib/acciones.ts` | hecho y probado con llama3.1 |
| Servidor MCP del calendario | `mcp/servidor.ts` | esqueleto: anuncia las 4 tools |
| Captura de voz, intencion, respuesta | | Sesion 2 |
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
6. `npm run dev`, abre http://localhost:3000 y pulsa "Conectar Google Calendar". La app guarda el token y crea su
   propio calendario "Agente de voz (demo)": es el unico que puede tocar (permiso `calendar.app.created`).
7. Opcional: `node --env-file=.env.local scripts/sembrar.ts` mete eventos de ejemplo.

## Comprobaciones

- `python stt/probar.py mi_audio.m4a --formato` transcribe un audio y ensena el formato antes y despues.
- `node --env-file=.env.local scripts/probar-permisos.ts` demo del permiso minimo (tu calendario principal: 404).
- `node scripts/probar-mcp.ts` y `python mcp/cliente_jsonrpc.py mcp/servidor.ts list` el MCP por dentro.
