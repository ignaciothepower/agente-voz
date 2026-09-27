// Etapa 3: del texto transcrito a la intencion estructurada (accion + parametros) con llama3.1 en Ollama.
// Todavia NO se ejecuta nada: solo entendemos. Basura entra, basura sale: si Whisper se equivoca, esto tambien.
import { comoTools, esDestructiva } from "./acciones.ts";

const OLLAMA = process.env.OLLAMA_URL ?? "http://localhost:11434";
const MODELO = process.env.OLLAMA_MODELO ?? "llama3.1";
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

const SISTEMA = (fecha: string) =>
  `Eres el asistente de voz de un calendario. ${fecha}
Te llega lo que el usuario ha dicho, ya transcrito. Elige UNA de las herramientas y rellena sus parametros.
Resuelve las fechas relativas (manana, el jueves) a AAAA-MM-DD y las horas a HH:MM de 24 horas.
Si el usuario habla de otra cosa ademas del calendario, ignora esa parte.
Si lo que pide no es del calendario, no uses ninguna herramienta y responde solo: FUERA_DE_ALCANCE.`;

export async function interpretar(texto: string): Promise<Intencion> {
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
        { role: "system", content: SISTEMA(contextoFecha()) },
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
