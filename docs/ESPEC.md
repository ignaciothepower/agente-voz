# Especificacion: agente de voz que gestiona tu calendario

Hablas al navegador ("crea una reunion manana a las diez") y el agente lo apunta en tu Google Calendar.
Alcance: SOLO el calendario de demo "Agente de voz (demo)". Nada de correo, contactos ni otros calendarios.

## Las cinco etapas

| # | Etapa | Que hace en nuestro caso | Donde corre | Tecnologia | Sesion |
|---|-------|--------------------------|-------------|------------|--------|
| 1 | Captura de audio | Boton "hablar": pide el microfono y graba la frase | Navegador | getUserMedia + MediaRecorder (webm/opus) | S2 |
| 2 | Transcripcion (STT) | Convierte la grabacion en texto en espanol | Servidor local | Whisper small (openai-whisper) + ffmpeg a 16 kHz mono | S1-S2 |
| 3 | Interpretacion de la intencion | Del texto a un JSON: accion + parametros | Servidor | llama3.1 en Ollama con el esquema de `src/lib/acciones.ts` | S2 |
| 4 | Ejecucion de la accion | Crea, lista, mueve o borra el evento | Servidor MCP | MCP de calendario -> Google Calendar API | S3 |
| 5 | Respuesta al usuario | Confirma lo hecho, o repregunta si falta algo | Navegador | Texto + voz (Web Speech API, SpeechSynthesis) | S2-S4 |

## Reglas de diseno

- **Basura entra, basura sale**: si Whisper transcribe mal, la intencion sera mala. Se muestra siempre el texto transcrito.
- **Si falta un dato, se pregunta**: nunca inventar hora, fecha o "cual de las reuniones" (S3).
- **Confirmacion humana**: crear, mover y borrar son destructivas y piden un "si" explicito (S4). Listar va directo.
- **Secretos fuera del codigo**: credenciales de Google en `.env.local` (local) y en variables de la plataforma (produccion).
- **Permisos minimos (OAuth)**: solo `calendar.app.created`: la app crea su calendario y SOLO puede tocar ese.
- **Coste cero**: Whisper y el LLM en local, Google Calendar API gratis.

## Fuera de alcance (a proposito)

- Invitar a otras personas, salas, videollamadas.
- Eventos recurrentes.
- Cualquier cosa que no sea el calendario ("solo puedo gestionar tu calendario").
