# Agente de voz: asistente que gestiona tu calendario

Proyecto del Master de Desarrollo Agentico (The Power), P2, 4 sesiones. Especificacion completa en `docs/ESPEC.md`.

## Contexto
- Flujo: voz (navegador) -> Whisper local (STT) -> LLM de intencion (llama3.1, Ollama) -> accion (MCP -> Google Calendar) -> respuesta.
- Coste cero: nada de APIs de pago. Todo el contenido, comentarios y mensajes de commit en espanol.
- El agente solo toca el calendario "Agente de voz (demo)" (variable GOOGLE_CALENDARIO), nunca el principal.

## Estructura
- `src/app` Next.js 15 (App Router, TypeScript, Tailwind 4).
- `src/lib/google.ts` OAuth 2.0 y Calendar API con fetch (sin la libreria googleapis).
- `src/lib/acciones.ts` esquema de las 4 acciones (crear/listar/mover/borrar), destructivas marcadas.
- `src/components/BotonHablar.tsx` captura en el navegador y voz de vuelta; `src/lib/intencion.ts` (llama3.1) y `src/lib/respuesta.ts` (plantillas, sin LLM).
- `stt/` servicio Python de transcripcion (Whisper small + ffmpeg a 16 kHz mono) en http://127.0.0.1:8765.
- `mcp/servidor.ts` servidor MCP del calendario (S3: llama de verdad a Google Calendar via `src/lib/calendario.ts`).
- `src/lib/validar.ts` comprobaciones en codigo; `src/lib/agente.ts` el host MCP con memoria y ambiguedad; `/api/agente`.
- `scripts/` pruebas que se ejecutan con `node scripts/<archivo>.ts` (node 24 ejecuta TypeScript).

## Reglas
- Secretos solo en `.env.local` (en .gitignore). Nunca en el codigo ni en los commits.
- Acciones destructivas: siempre confirmacion humana antes de ejecutar.
- Si falta un dato, repreguntar; nunca inventarlo.
- Los textos que ve u oye el usuario, en espanol correcto con tildes (el TTS los lee tal cual). En el codigo, sin tildes.
- Nada que no haya dicho el usuario llega al calendario: horas, dias o eventos inventados por el LLM se descartan.
- Borrar a partir de una descripcion nunca se ejecuta directo (el lentista borro al dentista en una prueba).
- Las fechas relativas NO se fian al LLM (confundio el jueves con el miercoles): se calculan o validan en codigo (S3).

## Comandos
- `npm run dev` app en http://localhost:3000
- `python stt/servidor.py` servicio de Whisper (venv con stt/requirements.txt)
- `python stt/probar.py audio.m4a --formato` probar una transcripcion
- `node scripts/probar-acciones.ts "frase"` ver que accion elige el LLM
- `node scripts/probar-mcp.ts` cliente MCP: lista las tools y llama a una
- `python mcp/cliente_jsonrpc.py mcp/servidor.ts list` ver los mensajes JSON-RPC crudos (reciclado de AI Engineer S10)
