// Etapa 3: del texto transcrito a la intencion estructurada (accion + parametros) con llama3.1 en Ollama.
// Todavia NO se ejecuta nada: solo entendemos. Basura entra, basura sale: si Whisper se equivoca, esto tambien.
// Sesion 4: en produccion no hay Ollama (Vercel no tiene GPU ni 5 GB de RAM para llama3.1). Con LLM=gemini se usa
// Gemini (capa gratuita de Google AI Studio) con EL MISMO esquema de acciones y el mismo prompt. El resto del agente
// (validacion, confirmacion, frenos) no sabe ni le importa que modelo hay detras.
import { ACCIONES, comoTools, esDestructiva } from "./acciones.ts";

const OLLAMA = process.env.OLLAMA_URL ?? "http://localhost:11434";
const PROVEEDOR = process.env.LLM ?? "ollama";
const MODELO = PROVEEDOR === "gemini" ? process.env.GEMINI_MODELO ?? "gemini-2.5-flash" : process.env.OLLAMA_MODELO ?? "llama3.1";
const ZONA = "Europe/Madrid";

export type Intencion = {
  accion: string | null;                  // crear_evento, listar_eventos... o null si no es del calendario
  parametros: Record<string, unknown>;
  destructiva: boolean;
  nota?: string;                           // lo que dijo el modelo si no eligio ninguna herramienta
  segundos: number;
  modelo: string;
};

// El LLM no tiene reloj: le decimos hoy, el dia de la semana y la hora, o "manana" y "el jueves" no significan nada
export function contextoFecha(ahora = new Date()): string {
  const dia = ahora.toLocaleDateString("sv-SE", { timeZone: ZONA });
  const semana = ahora.toLocaleDateString("es-ES", { timeZone: ZONA, weekday: "long" });
  const hora = ahora.toLocaleTimeString("es-ES", { timeZone: ZONA, hour: "2-digit", minute: "2-digit" });
  return `Hoy es ${semana} ${dia} y son las ${hora} (zona ${ZONA}).`;
}

const SISTEMA = (fecha: string, contexto?: string) =>
  `Eres el asistente de voz de un calendario. ${fecha}${contexto ? `
CONVERSACION EN CURSO: ${contexto}` : ""}
Te llega lo que el usuario ha dicho, ya transcrito. Elige UNA de las herramientas y rellena sus parametros.
Resuelve las fechas relativas (manana, el jueves) a AAAA-MM-DD y las horas a HH:MM de 24 horas.
Si el usuario habla de otra cosa ademas del calendario, ignora esa parte.
Si lo que pide no es del calendario, no uses ninguna herramienta y responde solo: FUERA_DE_ALCANCE.`;

// contexto (S3): lo que se esta construyendo o el ultimo evento creado, para que "mejor a las once" tenga sentido
export async function interpretar(texto: string, contexto?: string): Promise<Intencion> {
  return PROVEEDOR === "gemini" ? conGemini(texto, contexto) : conOllama(texto, contexto);
}

async function conOllama(texto: string, contexto?: string): Promise<Intencion> {
  const t0 = Date.now();
  const r = await fetch(`${OLLAMA}/api/chat`, {
    method: "POST",
    body: JSON.stringify({
      model: MODELO,
      stream: false,
      keep_alive: process.env.OLLAMA_KEEP_ALIVE ?? "5m", // caliente entre frases; al acabar: ollama stop
      options: { temperature: 0, num_predict: 200 },
      tools: comoTools(),
      messages: [
        { role: "system", content: SISTEMA(contextoFecha(), contexto) },
        { role: "user", content: texto },
      ],
    }),
  });
  if (!r.ok) throw new Error(`Ollama respondio ${r.status}`);
  const datos = await r.json();
  const llamada = datos.message?.tool_calls?.[0]?.function;
  const segundos = Math.round((Date.now() - t0) / 100) / 10;
  if (!llamada) {
    return { accion: null, parametros: {}, destructiva: false, nota: (datos.message?.content ?? "").trim(), segundos, modelo: MODELO };
  }
  return { accion: llamada.name, parametros: llamada.arguments ?? {}, destructiva: esDestructiva(llamada.name), segundos, modelo: MODELO };
}

// Gemini: la API REST de generateContent con function calling. La clave va en una cabecera, nunca en la URL
// (las URLs acaban en los logs). Las mismas 4 acciones, traducidas a "functionDeclarations".
async function conGemini(texto: string, contexto?: string): Promise<Intencion> {
  const clave = process.env.GEMINI_API_KEY;
  if (!clave) throw new Error("Falta GEMINI_API_KEY");
  const t0 = Date.now();
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": clave },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SISTEMA(contextoFecha(), contexto) }] },
      contents: [{ role: "user", parts: [{ text: texto }] }],
      tools: [{ functionDeclarations: ACCIONES.map((a) => ({ name: a.nombre, description: a.descripcion, parameters: a.parametros })) }],
      generationConfig: { temperature: 0, maxOutputTokens: 200, thinkingConfig: { thinkingBudget: 0 } },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const datos = await r.json();
  if (!r.ok) throw new Error(r.status === 429 ? "Gemini: limite de la capa gratuita alcanzado, espera un minuto" : `Gemini respondio ${r.status}: ${datos.error?.message ?? ""}`);
  const partes: { text?: string; functionCall?: { name: string; args?: Record<string, unknown> } }[] = datos.candidates?.[0]?.content?.parts ?? [];
  const llamada = partes.find((p) => p.functionCall)?.functionCall;
  const segundos = Math.round((Date.now() - t0) / 100) / 10;
  if (!llamada) {
    return { accion: null, parametros: {}, destructiva: false, nota: partes.map((p) => p.text ?? "").join("").trim(), segundos, modelo: MODELO };
  }
  return { accion: llamada.name, parametros: llamada.args ?? {}, destructiva: esDestructiva(llamada.name), segundos, modelo: MODELO };
}
