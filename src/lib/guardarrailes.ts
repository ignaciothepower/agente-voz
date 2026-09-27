// Sesion 4: los FRENOS del agente. Un agente que actua sobre tu calendario real no puede fiarse ni del LLM
// ni del usuario: estas reglas se comprueban en codigo, siempre, antes de tocar nada.
// Viven en dos sitios: los datos (pasado, duracion, titulo) en el servidor MCP, para que cualquier host quede
// protegido; el ritmo, el alcance y lo masivo en el host (src/lib/agente.ts), que es quien conoce la conversacion.
// Sin imports salvo validar.ts: node ejecuta este archivo directamente (tests y servidor MCP).
import { aEntero, sinTildes } from "./validar.ts";

const ZONA = "Europe/Madrid";

export const LIMITES = {
  duracionMin: 5,            // minutos
  duracionMax: 480,          // 8 horas: una "reunion de 3 dias" es un error de transcripcion, no una reunion
  diasAdelante: 365,         // nada mas alla de un año vista
  tituloMax: 80,
  cambiosPorVentana: 5,      // acciones que cambian el calendario...
  ventanaMin: 10,            // ...cada 10 minutos, por conversacion
  confirmacionSeg: 120,      // un "si" que llega 2 minutos despues ya no vale
};

export type Freno = { freno: "pasado" | "lejos" | "duracion" | "titulo" | "ritmo" | "masivo" | "alcance"; texto: string };

// "2026-09-27T18:05" en hora de Madrid: se compara como texto con la fecha y hora del evento
export function ahoraEnMadrid(ahora = new Date()): string {
  return ahora.toLocaleString("sv-SE", { timeZone: ZONA }).replace(" ", "T").slice(0, 16);
}

// 1 · Los DATOS de una accion que va a cambiar el calendario (crear o mover)
export function revisarDatos(p: { fecha?: string; hora?: string; duracion?: unknown; titulo?: unknown }, ahora = new Date()): Freno | null {
  if (p.fecha && p.hora) {
    const cuando = `${p.fecha}T${p.hora}`;
    if (cuando < ahoraEnMadrid(ahora))
      return { freno: "pasado", texto: `Eso sería en el pasado (${p.fecha.slice(8)}/${p.fecha.slice(5, 7)} a las ${p.hora}). Dime otra fecha u hora.` };
    const limite = new Date(ahora.getTime() + LIMITES.diasAdelante * 86_400_000).toLocaleDateString("sv-SE", { timeZone: ZONA });
    if (p.fecha > limite) return { freno: "lejos", texto: "Solo gestiono el próximo año. Dime una fecha más cercana." };
  }
  if (p.duracion !== undefined) {
    const d = aEntero(p.duracion);
    if (d === null || d < LIMITES.duracionMin || d > LIMITES.duracionMax)
      return { freno: "duracion", texto: `La duración tiene que estar entre ${LIMITES.duracionMin} minutos y ${LIMITES.duracionMax / 60} horas.` };
  }
  if (typeof p.titulo === "string" && p.titulo.length > LIMITES.tituloMax)
    return { freno: "titulo", texto: `El título es demasiado largo (máximo ${LIMITES.tituloMax} caracteres).` };
  return null;
}

// 2 · El RITMO: cuantas acciones que cambian el calendario lleva esta conversacion en la ventana
export function revisarRitmo(hechas: number[], ahora = Date.now()): Freno | null {
  const recientes = hechas.filter((t) => ahora - t < LIMITES.ventanaMin * 60_000);
  if (recientes.length >= LIMITES.cambiosPorVentana)
    return { freno: "ritmo", texto: `Por seguridad no hago más de ${LIMITES.cambiosPorVentana} cambios cada ${LIMITES.ventanaMin} minutos. Espera un poco.` };
  return null;
}

// 3 · Lo MASIVO: "borra todo", "cancela todas las reuniones". No hay tool para eso, y no la va a haber
export function revisarMasivo(texto: string): Freno | null {
  const t = sinTildes(texto);
  if (/\b(borr|elimin|quita|cancel|vacia|limpia)\w*\b.*\b(todo|todos|todas|toda la|entero|completo)\b/.test(t) || /\b(vacia|limpia) (el|mi) calendario/.test(t))
    return { freno: "masivo", texto: "Solo cambio eventos de uno en uno. Dime cuál quieres borrar." };
  return null;
}

// 4 · La CONFIRMACION: solo un si claro y corto vale como si. "si puedes, mueve..." NO es una confirmacion
export function esAfirmacion(texto: string): boolean {
  const t = sinTildes(texto).replace(/[^a-z ]/g, " ").trim();
  if (t.split(/\s+/).length > 5) return false;
  return /^(si|vale|ok|okay|confirmo|confirmado|adelante|hazlo|claro|correcto|de acuerdo|perfecto)\b/.test(t) && !esNegacion(texto);
}

export function esNegacion(texto: string): boolean {
  const t = sinTildes(texto).replace(/[^a-z ]/g, " ").trim();
  return /^(no|cancela|cancelalo|olvidalo|dejalo|para|espera|mejor no)\b/.test(t);
}

// 5 · El REGISTRO: cada accion ejecutada (y cada freno) deja una linea JSON. En local va tambien a
// logs/acciones.jsonl; en Vercel el disco es de solo lectura y la linea queda en los logs de la funcion.
export type Registro = {
  ts: string;
  conversacion: string;
  tipo: "accion" | "freno" | "cancelada";
  tool?: string;
  args?: Record<string, unknown>;
  resultado?: string;
  freno?: string;
  texto: string;
};

export async function registrar(r: Omit<Registro, "ts">) {
  const linea = JSON.stringify({ ts: new Date().toISOString(), ...r });
  console.log(`[registro] ${linea}`);
  if (process.env.VERCEL) return;
  try {
    const fs = await import("node:fs/promises");
    await fs.mkdir("logs", { recursive: true });
    await fs.appendFile("logs/acciones.jsonl", linea + "\n");
  } catch {
    // el registro nunca debe tumbar una accion que ya se ha hecho
  }
}
