// Sesion 3: las acciones de verdad sobre Google Calendar, con sus comprobaciones. Lo usa el servidor MCP.
// Si falta un dato, no se encuentra el evento o hay varios candidatos, NO se adivina: se devuelve el motivo
// para que el agente pregunte. Importes con .ts: node ejecuta este archivo directamente desde mcp/servidor.ts.
// Sesion 4: toda accion que cambia el calendario acepta "simular: true" (un ensayo: valida y dice que HARIA, sin
// tocar nada) para que el host pueda pedir confirmacion con datos reales, y pasa por los frenos de guardarrailes.ts.
import { revisarDatos } from "./guardarrailes.ts";
import { actualizarEventoRaw, borrarEventoRaw, crearEventoRaw, listarEventos, rangoDeHoy, type Evento } from "./google.ts";
import { aEntero, diaSemana, fechaValida, horaValida, hoyEnMadrid, sinTildes, sumarDias } from "./validar.ts";

export type Resultado =
  | { ok: true; texto: string; evento?: Evento; eventos?: Evento[]; simulado?: boolean }
  | { ok: false; motivo: "falta" | "no_encontrado" | "ambiguo" | "invalido" | "freno"; texto: string; faltan?: string[]; opciones?: Evento[]; freno?: string };

const desfase = () => rangoDeHoy().desde.slice(19); // "+02:00" (cambia solo en octubre)
const iso = (fecha: string, hora: string) => `${fecha}T${hora}:00`;

function mas(fecha: string, hora: string, minutos: number): string {
  const [h, m] = hora.split(":").map(Number);
  const total = h * 60 + m + minutos;
  const dia = sumarDias(fecha, Math.floor(total / 1440));
  const r = ((total % 1440) + 1440) % 1440;
  return iso(dia, `${String(Math.floor(r / 60)).padStart(2, "0")}:${String(r % 60).padStart(2, "0")}`);
}

export const fechaDe = (e: Evento) => e.inicio.slice(0, 10);
export const horaDe = (e: Evento) => e.inicio.slice(11, 16);
export const duracionDe = (e: Evento) => Math.round((Date.parse(e.fin) - Date.parse(e.inicio)) / 60000);
export const describir = (e: Evento) => `"${e.titulo}" el ${diaSemana(fechaDe(e))} ${fechaDe(e).slice(8)} a las ${horaDe(e)}`;

export async function crear(p: Record<string, unknown>): Promise<Resultado> {
  const titulo = typeof p.titulo === "string" && p.titulo.trim() ? p.titulo.trim() : null;
  const fecha = fechaValida(p.fecha);
  const hora = horaValida(p.hora);
  if ((p.fecha && !fecha) || (p.hora && !hora)) return { ok: false, motivo: "invalido", texto: `Fecha u hora imposible: ${p.fecha ?? ""} ${p.hora ?? ""}` };
  const faltan = [!titulo && "titulo", !fecha && "fecha", !hora && "hora"].filter(Boolean) as string[];
  if (faltan.length) return { ok: false, motivo: "falta", faltan, texto: `Me falta: ${faltan.join(", ")}` };
  const freno = revisarDatos({ fecha: fecha!, hora: hora!, duracion: p.duracion_min ?? 60, titulo });
  if (freno) return { ok: false, motivo: "freno", freno: freno.freno, texto: freno.texto };
  const dur = aEntero(p.duracion_min ?? 60)!;
  if (p.simular) {
    const previsto: Evento = { id: "", titulo: titulo!, inicio: iso(fecha!, hora!), fin: mas(fecha!, hora!, dur) };
    return { ok: true, simulado: true, evento: previsto, texto: `crear ${describir(previsto)} (${dur} min)${await avisoSolape(previsto)}` };
  }
  const e = await crearEventoRaw(titulo!, iso(fecha!, hora!), mas(fecha!, hora!, dur));
  const evento: Evento = { id: e.id, titulo: titulo!, inicio: iso(fecha!, hora!), fin: mas(fecha!, hora!, dur), enlace: e.htmlLink };
  return { ok: true, evento, texto: `Creado ${describir(evento)} (${dur} min)` };
}

// Hallazgo S4: el primer ensayo dio por bueno crear "Reunion con equipo de marketing" el lunes a las 10... que YA
// existia desde la S3. No es un error (puedes querer dos cosas a la vez), pero quien confirma tiene que saberlo.
// Se compara como texto "AAAA-MM-DDTHH:MM" en hora de Madrid: en Vercel el reloj del servidor va en UTC.
async function avisoSolape(nuevo: Evento, excluir?: string): Promise<string> {
  const dia = nuevo.inicio.slice(0, 10);
  const del_dia = await listarEventos(`${dia}T00:00:00${desfase()}`, `${dia}T23:59:59${desfase()}`);
  const ini = nuevo.inicio.slice(0, 16), fin = nuevo.fin.slice(0, 16);
  const choca = del_dia.filter((e) => e.id !== excluir && e.inicio.slice(0, 16) < fin && e.fin.slice(0, 16) > ini);
  if (!choca.length) return "";
  return `. Ojo: a esa hora ya tienes ${choca.map((e) => `"${e.titulo}" a las ${horaDe(e)}`).join(" y ")}`;
}

export async function listar(p: Record<string, unknown>): Promise<Resultado> {
  const desde = fechaValida(p.desde) ?? hoyEnMadrid();
  const hasta = fechaValida(p.hasta) ?? desde;
  const eventos = await listarEventos(`${desde}T00:00:00${desfase()}`, `${hasta}T23:59:59${desfase()}`);
  return { ok: true, eventos, texto: eventos.length ? eventos.map(describir).join("; ") : "No hay nada en esas fechas" };
}

// Busca el evento que describe el usuario entre hoy y dentro de 14 dias, por palabras y por dia de la semana
export async function buscar(descripcion: string): Promise<Evento[]> {
  const hoy = hoyEnMadrid();
  const eventos = await listarEventos(`${hoy}T00:00:00${desfase()}`, `${sumarDias(hoy, 14)}T23:59:59${desfase()}`);
  const d = sinTildes(descripcion);
  const palabras = d.split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !["reunion", "evento", "cita"].includes(w));
  // OJO (hallazgo S3): con solo "cita" en comun, "la cita con el lentista" encontro -y BORRO- "Cita con el dentista".
  // Ahora hace falta una palabra propia del evento, o el dia de la semana MAS el tipo (reunion/cita).
  const puntua = (e: Evento) => {
    const t = sinTildes(e.titulo);
    const propias = palabras.filter((w) => t.includes(w)).length;
    const dia = d.includes(diaSemana(fechaDe(e)));
    const tipo = (/reunion/.test(d) && /reunion/.test(t)) || (/cita/.test(d) && /cita/.test(t));
    if (!propias && !(dia && tipo)) return 0;
    return propias * 2 + (dia ? 2 : 0) + (tipo ? 1 : 0);
  };
  return eventos.map((e) => ({ e, s: puntua(e) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s)
    .filter((x, _, todos) => x.s === todos[0].s).map((x) => x.e); // solo los que empatan en lo mas alto
}

async function uno(descripcion: unknown): Promise<{ evento?: Evento; fallo?: Resultado }> {
  if (typeof descripcion !== "string" || !descripcion.trim())
    return { fallo: { ok: false, motivo: "falta", faltan: ["evento"], texto: "¿Que evento?" } };
  const encontrados = await buscar(descripcion);
  if (encontrados.length === 0) return { fallo: { ok: false, motivo: "no_encontrado", texto: `No encuentro "${descripcion}" en los proximos 14 dias` } };
  if (encontrados.length > 1) return { fallo: { ok: false, motivo: "ambiguo", opciones: encontrados, texto: `Hay ${encontrados.length} que encajan con "${descripcion}"` } };
  return { evento: encontrados[0] };
}

export async function mover(p: Record<string, unknown>, id?: string): Promise<Resultado> {
  let evento: Evento | undefined;
  if (id) evento = (await buscarPorId(id)) ?? undefined;
  if (!evento) {
    const r = await uno(p.evento);
    if (r.fallo) return r.fallo;
    evento = r.evento!;
  }
  const fecha = fechaValida(p.nueva_fecha) ?? fechaDe(evento);
  const hora = horaValida(p.nueva_hora) ?? horaDe(evento);
  const dur = aEntero(p.duracion_min) ?? duracionDe(evento);
  if (!p.nueva_fecha && !p.nueva_hora && p.duracion_min === undefined)
    return { ok: false, motivo: "falta", faltan: ["nueva_hora"], texto: `¿A que hora muevo ${describir(evento)}?`, opciones: [evento] };
  // Hallazgo S4: "mueve la reunion del jueves a las cinco" cuando YA estaba a las cinco pedia confirmar... nada
  if (fecha === fechaDe(evento) && hora === horaDe(evento) && dur === duracionDe(evento))
    return { ok: false, motivo: "invalido", texto: `${describir(evento)} ya está justo así: no hay nada que cambiar` };
  const freno = revisarDatos({ fecha, hora, duracion: dur });
  if (freno) return { ok: false, motivo: "freno", freno: freno.freno, texto: freno.texto };
  if (p.simular) {
    const aviso = await avisoSolape({ ...evento, inicio: iso(fecha, hora), fin: mas(fecha, hora, dur) }, evento.id);
    return { ok: true, simulado: true, evento, texto: `mover ${describir(evento)} al ${diaSemana(fecha)} ${fecha.slice(8)} a las ${hora} (${dur} min)${aviso}` };
  }
  await actualizarEventoRaw(evento.id, iso(fecha, hora), mas(fecha, hora, dur));
  const nuevo: Evento = { ...evento, inicio: iso(fecha, hora), fin: mas(fecha, hora, dur) };
  return { ok: true, evento: nuevo, texto: `Movido ${describir(evento)} -> ${diaSemana(fecha)} ${fecha.slice(8)} a las ${hora} (${dur} min)` };
}

export async function borrar(p: Record<string, unknown>, id?: string): Promise<Resultado> {
  let evento: Evento | undefined;
  if (id) evento = (await buscarPorId(id)) ?? undefined;
  if (!evento) {
    const r = await uno(p.evento);
    if (r.fallo) return r.fallo;
    // En un ensayo si se puede localizar por descripcion: no se toca nada y el host pide confirmacion con el id
    if (p.simular) return { ok: true, simulado: true, evento: r.evento, texto: `borrar ${describir(r.evento!)}` };
    // Borrar a partir de una DESCRIPCION nunca se ejecuta directo: se devuelve el candidato y el host confirma con su id
    return { ok: false, motivo: "ambiguo", opciones: [r.evento!], texto: `¿Es ${describir(r.evento!)}?` };
  }
  if (p.simular) return { ok: true, simulado: true, evento, texto: `borrar ${describir(evento)}` };
  await borrarEventoRaw(evento.id);
  return { ok: true, evento, texto: `Borrado ${describir(evento)}` };
}

async function buscarPorId(id: string): Promise<Evento | null> {
  const hoy = hoyEnMadrid();
  const eventos = await listarEventos(`${sumarDias(hoy, -1)}T00:00:00${desfase()}`, `${sumarDias(hoy, 30)}T23:59:59${desfase()}`);
  return eventos.find((e) => e.id === id) ?? null;
}
