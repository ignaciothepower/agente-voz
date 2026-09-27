// Sesion 3: el agente que ACTUA. Une la intencion (llama3.1), la validacion en codigo y el MCP del calendario,
// con memoria corta de la conversacion. IDEA CLAVE: si falta un dato o hay duda, PREGUNTA en vez de inventar.
// Las tres estrategias ante la ambiguedad: 1) preguntar lo que falta, 2) dar opciones para elegir,
// 3) proponer un valor por defecto y confirmarlo antes de actuar.
import { interpretar, type Intencion } from "./intencion.ts";
import { horaDelTexto, hoyEnMadrid, normalizar, pideMasTarde, sinTildes, sumarDias, type Correccion } from "./validar.ts";
import { llamarTool } from "./mcp-cliente.ts";
import { describir, duracionDe, horaDe, type Resultado } from "./calendario.ts";
import type { Evento } from "./google.ts";

type Borrador = { accion: string; parametros: Record<string, unknown> };
type Pendiente =
  | { tipo: "confirmar"; tool: string; args: Record<string, unknown>; resumen: string }
  | { tipo: "elegir"; tool: string; args: Record<string, unknown>; opciones: Evento[]; masTarde: boolean };

export type Estado = { borrador?: Borrador; pendiente?: Pendiente; ultimo?: Evento; turnos: number; log: { usuario: string; agente: string }[] };
export type Turno = {
  texto: string;
  intencion?: Intencion;
  cambios: Correccion[];
  llamada?: { tool: string; args: Record<string, unknown> };
  resultado?: Resultado;
  estrategia?: "preguntar" | "opciones" | "proponer";
  respuesta: string;
};

const ORDINALES = ["primer", "segund", "tercer", "cuart"];
const HORAS = (h: string) => { const [hh, mm] = h.split(":").map(Number); return mm ? `las ${hh}:${String(mm).padStart(2, "0")}` : `las ${hh}`; };

function sumarHora(hora: string, min: number) {
  const [h, m] = hora.split(":").map(Number);
  const t = Math.min(h * 60 + m + min, 23 * 60 + 30);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

// Lo que el LLM necesita saber de la conversacion para entender "mejor a las once" o "muevela"
function contexto(e: Estado): string | undefined {
  const partes = [];
  if (e.borrador) partes.push(`se esta preparando ${e.borrador.accion} con ${JSON.stringify(e.borrador.parametros)}; si el usuario da el dato que falta o corrige algo, usa la MISMA herramienta con todos los datos`);
  if (e.ultimo) partes.push(`el ultimo evento tocado es ${describir(e.ultimo)} (${duracionDe(e.ultimo)} min); si el usuario quiere cambiarlo ("muevela", "ponle..."), usa mover_evento con evento "${e.ultimo.titulo}"`);
  return partes.length ? partes.join(". ") : undefined;
}

function verboDeCalendario(texto: string): string | null {
  const s = sinTildes(texto);
  if (/\b(muev|mueve|mover|cambi|retras|adelant)/.test(s)) return "mover_evento";
  if (/\b(borr|elimin|quita|cancela la|cancela el)/.test(s)) return "borrar_evento";
  if (/\b(crea|apunta|agenda|programa|reserva)/.test(s)) return "crear_evento";
  if (/\b(que tengo|tengo algo|estoy libre)/.test(s)) return "listar_eventos";
  return null;
}

const seRefiereAlUltimo = (texto: string) =>
  /\b\w+(la|lo|le)\b/.test(sinTildes(texto).replace(/\b(la|lo|le)\b/g, "")) || /\b(ultim|esa|ese|esta reunion)/.test(sinTildes(texto));

async function ejecutar(e: Estado, t: Turno, tool: string, args: Record<string, unknown>): Promise<Turno> {
  t.llamada = { tool, args };
  const r: Resultado = await llamarTool(tool, args);
  t.resultado = r;
  if (r.ok) {
    e.borrador = undefined;
    e.pendiente = undefined;
    if (r.evento) e.ultimo = r.evento;
    t.respuesta = tool === "listar_eventos"
      ? r.eventos?.length ? `Tienes ${r.eventos.length}: ${r.eventos.map((x) => `a ${HORAS(horaDe(x))}, ${x.titulo}`).join("; ")}.` : "No tienes nada."
      : tool === "crear_evento" ? `Hecho: he creado ${describir(r.evento!)}.`
      : tool === "mover_evento" && !args.nueva_hora && !args.nueva_fecha ? `Hecho: ${describir(r.evento!)} ahora dura ${duracionDe(r.evento!)} minutos.`
      : tool === "mover_evento" ? `Hecho: ${r.texto.replace(/^Movido /, "he movido ").replace("->", "al")}.`
      : `Hecho: ${r.texto.toLowerCase()}.`;
  } else if (r.motivo === "ambiguo" && r.opciones) {
    e.pendiente = { tipo: "elegir", tool, args, opciones: r.opciones, masTarde: false };
    t.estrategia = "opciones";
    t.respuesta = `Tengo ${r.opciones.length} que encajan: ${r.opciones.map((o, i) => `${i + 1}) ${describir(o)}`).join("; ")}. ¿Cuál?`;
  } else if (r.motivo === "no_encontrado") {
    t.respuesta = `${r.texto}. ¿Cómo se llama el evento?`;
  } else {
    t.estrategia = "preguntar";
    t.respuesta = r.texto;
  }
  return t;
}

// Resuelve la respuesta del usuario a una pregunta anterior SIN LLM: "si", "no", "la segunda"...
async function resolverPendiente(e: Estado, t: Turno): Promise<Turno | null> {
  const p = e.pendiente!;
  const s = sinTildes(t.texto);
  if (p.tipo === "confirmar") {
    if (/\b(si|vale|confirm|claro|adelante|hazlo|ok)/.test(s)) return ejecutar(e, t, p.tool, p.args);
    if (/\b(no|cancela|olvida|dejalo)\b/.test(s)) { e.pendiente = undefined; t.respuesta = "Vale, no toco nada."; return t; }
    return null; // es otra orden: se interpreta de cero
  }
  const i = ORDINALES.findIndex((o) => s.includes(o));
  const n = s.match(/\b([1-4])\b/);
  const porTitulo = p.opciones.findIndex((o) => sinTildes(o.titulo).split(/\s+/).some((w) => w.length > 3 && s.includes(w)));
  const k = i >= 0 ? i : n ? Number(n[1]) - 1 : porTitulo;
  const elegido = p.opciones[k];
  if (!elegido) {
    // Ni un numero ni un nombre de la lista: volvemos a preguntar SIN llamar al LLM (serian otros 45 s)
    if (/\b(no|cancela|olvida|dejalo)\b/.test(s)) { e.pendiente = undefined; t.respuesta = "Vale, no toco nada."; return t; }
    // ...salvo que sea una orden nueva ("ponle una hora de duracion"): hallazgo S3, se quedaba atascado aqui
    if (verboDeCalendario(t.texto) || /\b(ponle|pon|mejor|cambia)\b/.test(s) || s.split(/\s+/).length > 3) return null;
    t.estrategia = "opciones";
    t.respuesta = `No te he entendido. Dime el número: ${p.opciones.map((o, j) => `${j + 1}) ${o.titulo}`).join("; ")}.`;
    return t;
  }
  e.pendiente = undefined;
  return seguirConEvento(e, t, p.tool, { ...p.args, id: elegido.id }, elegido, p.masTarde);
}

// Ya sabemos que evento: si falta la hora y dijo "mas tarde", proponemos +1 h y confirmamos (estrategia 3)
async function seguirConEvento(e: Estado, t: Turno, tool: string, args: Record<string, unknown>, ev: Evento, masTarde: boolean) {
  if (tool === "mover_evento" && !args.nueva_hora && !args.nueva_fecha && args.duracion_min === undefined) {
    if (masTarde) {
      const hora = sumarHora(horaDe(ev), 60);
      e.pendiente = { tipo: "confirmar", tool, args: { ...args, id: ev.id, nueva_hora: hora }, resumen: `mover ${describir(ev)} a ${HORAS(hora)}` };
      t.estrategia = "proponer";
      t.respuesta = `¿Muevo ${describir(ev)} una hora más tarde, a ${HORAS(hora)}?`;
      return t;
    }
    e.borrador = { accion: tool, parametros: { ...args, evento: ev.titulo } };
    t.estrategia = "preguntar";
    t.respuesta = `¿A qué hora muevo ${describir(ev)}?`;
    return t;
  }
  return ejecutar(e, t, tool, { ...args, id: ev.id });
}

export async function procesar(texto: string, e: Estado): Promise<Turno> {
  const t = await procesarTurno(texto, e);
  e.log = [...e.log, { usuario: texto, agente: t.respuesta }].slice(-6);
  return t;
}

async function procesarTurno(texto: string, e: Estado): Promise<Turno> {
  e.turnos++;
  const t: Turno = { texto, cambios: [], respuesta: "" };
  if (e.pendiente) {
    const r = await resolverPendiente(e, t);
    if (r) return r;
    e.pendiente = undefined;
  }

  const i = await interpretar(texto, contexto(e));
  t.intencion = i;
  // Hallazgo S3: con la regla FUERA_DE_ALCANCE, "muevela a mas tarde" (sin contexto) salia como fuera de alcance.
  // Red de seguridad en codigo: si hay un verbo de calendario, es una orden a la que le faltan datos, no otra cosa.
  const verbo = !i.accion ? verboDeCalendario(texto) : null;
  if (verbo) {
    t.cambios.push({ campo: "accion", antes: null, despues: verbo, motivo: "el LLM dijo fuera de alcance, pero hay un verbo de calendario" });
    i.accion = verbo;
    i.parametros = {};
  }
  // ...y si habia algo a medias ("¿a que hora?") y el LLM no eligio nada, la hora se saca del texto con codigo
  const hora = !i.accion && e.borrador ? horaDelTexto(texto) : null;
  if (hora) {
    t.cambios.push({ campo: "accion", antes: null, despues: e.borrador!.accion, motivo: `el LLM no eligio nada; completo lo que estaba a medias con la hora ${hora}` });
    i.accion = e.borrador!.accion;
    i.parametros = { ...e.borrador!.parametros, [e.borrador!.accion === "mover_evento" ? "nueva_hora" : "hora"]: hora };
  }
  if (!i.accion) {
    t.respuesta = "Solo puedo ayudarte con tu calendario: crear, consultar, mover o borrar eventos.";
    return t;
  }

  // Memoria: lo que ya sabiamos del borrador se conserva; solo se validan los datos NUEVOS de esta frase
  const previo = e.borrador?.accion === i.accion ? e.borrador.parametros : {};
  const nuevos = Object.fromEntries(Object.entries(i.parametros).filter(([k, v]) => JSON.stringify(previo[k]) !== JSON.stringify(v)));
  const { parametros, cambios } = normalizar(i.accion, nuevos, texto);
  t.cambios = [...t.cambios, ...cambios];
  const args: Record<string, unknown> = { ...previo, ...parametros };

  if (i.accion === "crear_evento") {
    const faltan = ["titulo", "fecha", "hora"].filter((k) => !args[k]);
    if (faltan.length) {
      e.borrador = { accion: i.accion, parametros: args };
      t.estrategia = "preguntar";
      t.respuesta = faltan.includes("hora") ? `¿A qué hora pongo "${args.titulo ?? "la reunión"}"?` : faltan.includes("fecha") ? "¿Qué día?" : "¿Cómo la llamo?";
      return t;
    }
    return ejecutar(e, t, "crear_evento", args);
  }

  if (i.accion === "mover_evento" || i.accion === "borrar_evento") {
    const masTarde = pideMasTarde(texto);
    // "muevela", "ponle...", o una correccion justo despues ("mejor a las once"): se refiere al ultimo evento tocado
    const corrige = /^\W*(mmm\W*)?(mejor|no,|en vez|cambia|mas bien)/.test(sinTildes(texto));
    if (!args.evento && e.ultimo && (seRefiereAlUltimo(texto) || corrige)) return seguirConEvento(e, t, i.accion, args, e.ultimo, masTarde);
    if (!args.evento && e.ultimo && e.ultimo.titulo && args.duracion_min !== undefined) return seguirConEvento(e, t, i.accion, args, e.ultimo, masTarde);
    if (!args.evento) {
      // Estrategia 2: no sabemos cual -> ofrecemos los proximos eventos para elegir
      // (de hoy a 7 dias: con solo "hoy", a las 20:00 quedaba una opcion y "la segunda" no existia)
      const hoy = hoyEnMadrid();
      const r: Resultado = await llamarTool("listar_eventos", { desde: hoy, hasta: sumarDias(hoy, 7) });
      const proximos = (r.ok ? r.eventos ?? [] : []).filter((x) => Date.parse(x.fin) > Date.now()).slice(0, 3);
      if (proximos.length === 0) { t.respuesta = "¿Qué evento? No veo nada pendiente esta semana."; return t; }
      if (proximos.length === 1) return seguirConEvento(e, t, i.accion, args, proximos[0], masTarde); // solo uno: se propone
      e.pendiente = { tipo: "elegir", tool: i.accion, args, opciones: proximos, masTarde };
      t.estrategia = "opciones";
      t.respuesta = `¿Cuál ${i.accion === "mover_evento" ? "muevo" : "borro"}? ${proximos.map((o, k) => `${k + 1}) ${describir(o)}`).join("; ")}.`;
      return t;
    }
    if (i.accion === "mover_evento" && masTarde && !args.nueva_hora) {
      const r: Resultado = await llamarTool("mover_evento", args); // sin hora: el MCP solo lo localiza y dice que falta
      if (!r.ok && r.motivo === "falta" && r.opciones?.[0]) return seguirConEvento(e, t, i.accion, args, r.opciones[0], true);
      t.resultado = r;
      t.respuesta = r.texto;
      return t;
    }
  }
  return ejecutar(e, t, i.accion, args);
}

// Memoria corta en el servidor: una conversacion por cookie, 30 minutos
type Global = { __conversaciones?: Map<string, { estado: Estado; hasta: number }> };
const g = globalThis as Global;
export function estadoDe(id: string): Estado {
  g.__conversaciones ??= new Map();
  const c = g.__conversaciones.get(id);
  if (c && c.hasta > Date.now()) { c.hasta = Date.now() + 30 * 60_000; return c.estado; }
  const estado: Estado = { turnos: 0, log: [] };
  g.__conversaciones.set(id, { estado, hasta: Date.now() + 30 * 60_000 });
  return estado;
}
