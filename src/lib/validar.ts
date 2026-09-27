// Sesion 3: el LLM entiende la intencion, pero los DATOS se comprueban en codigo antes de ejecutar nada.
// Todo lo de aqui viene de fallos reales de la S2: el jueves que era miercoles, "Reunin", "60" como texto
// y "la reunion del jueves" inventada para "muevela a mas tarde". Sin imports: node lo ejecuta tal cual.

const ZONA = "Europe/Madrid";
const DIAS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
const VACIAS = new Set(["el", "la", "los", "las", "de", "del", "con", "a", "al", "en", "mi", "una", "un", "que", "por", "favor", "y", "o", "lo", "le"]);

// "Reunión" -> "reunion": para comparar sin que importen tildes ni mayusculas
export function sinTildes(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function palabras(t: string): string[] {
  return sinTildes(t).split(/[^a-z0-9ñ]+/).filter(Boolean);
}

export function hoyEnMadrid(ahora = new Date()): string {
  return ahora.toLocaleDateString("sv-SE", { timeZone: ZONA });
}

export function sumarDias(fecha: string, n: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function diaSemana(fecha: string): string {
  return DIAS[new Date(`${fecha}T12:00:00Z`).getUTCDay()];
}

// 1 · Fechas relativas CALCULADAS, no adivinadas: "manana", "pasado manana", "el jueves"...
export function fechaDelTexto(texto: string, hoy = hoyEnMadrid()): string | null {
  const t = sinTildes(texto);
  if (/pasado manana/.test(t)) return sumarDias(hoy, 2);
  if (/(^|[^e] )manana/.test(t.replace(/de la manana/g, ""))) return sumarDias(hoy, 1); // "de la manana" es por la manana
  if (/\bhoy\b/.test(t)) return hoy;
  const hoyN = new Date(`${hoy}T12:00:00Z`).getUTCDay();
  for (let i = 0; i < 7; i++) {
    if (new RegExp(`\\b${DIAS[i]}\\b`).test(t)) return sumarDias(hoy, (i - hoyN + 7) % 7 || 7); // el proximo, nunca hoy
  }
  return null;
}

// 2 · ¿Ha dicho el usuario alguna hora? Si no, una hora del LLM es inventada
export function mencionaHora(texto: string): boolean {
  // "una hora de duracion" o "30 minutos" hablan de cuanto dura, no de a que hora
  const t = sinTildes(texto).replace(/\b(una|media|dos|tres|\d+) (horas?|minutos)( y media)?( de duracion)?/g, "");
  // Hallazgo S3: "crea UNA reunion manana" contaba como hora (la una) y dejo pasar unas 08:00 inventadas.
  // Una hora es "a las once", "las 5", "a la una", "10:30", "5 de la tarde" o "mediodia"; un numero suelto no.
  const NUM = "(\\d{1,2}|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)";
  return /\b\d{1,2}[:.h]\d{2}\b/.test(t) || /\bmediodia\b/.test(t) ||
    new RegExp(`\\b(a|sobre|hacia|para) (la|las) ${NUM}\\b`).test(t) || new RegExp(`\\blas ${NUM}\\b`).test(t) ||
    new RegExp(`\\b${NUM} (de la (manana|tarde|noche)|en punto|y media|y cuarto|menos cuarto)`).test(t);
}

// La hora tambien se puede sacar con codigo: "a las once" -> 11:00, "a las cinco de la tarde" -> 17:00
const NUMEROS = ["", "una", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce"];
export function horaDelTexto(texto: string): string | null {
  const t = sinTildes(texto);
  const m = t.match(new RegExp(`\\b(?:a|las|la|sobre las) (\\d{1,2}|${NUMEROS.slice(1).join("|")})(?::(\\d{2}))?( y media| y cuarto)?( de la (manana|tarde|noche))?`));
  if (!m) return null;
  let h = /^\d+$/.test(m[1]) ? Number(m[1]) : NUMEROS.indexOf(m[1]);
  if (h < 0 || h > 23) return null;
  if (m[5] && m[5] !== "manana" && h < 12) h += 12;
  const min = m[2] ? Number(m[2]) : m[3] === " y media" ? 30 : m[3] === " y cuarto" ? 15 : 0;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

// ... y alguna fecha? ("el 3", "3 de octubre", "la semana que viene", o un dia relativo)
export function mencionaFecha(texto: string, hoy = hoyEnMadrid()): boolean {
  const t = sinTildes(texto);
  return fechaDelTexto(texto, hoy) !== null ||
    /\b(dia \d{1,2}|el \d{1,2}\b|\d{1,2} de|semana|mes|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/.test(t);
}

export function pideMasTarde(texto: string): boolean {
  return /\b(mas tarde|luego|despues|retrasa)/.test(sinTildes(texto));
}

// 3 · ¿El evento que dice el LLM sale de lo que dijo el usuario? Si ninguna palabra coincide, es inventado
export function estaEnElTexto(descripcion: string, texto: string): boolean {
  const dichas = new Set(palabras(texto));
  return palabras(descripcion).some((p) => p.length > 3 && !VACIAS.has(p) && dichas.has(p));
}

// Hallazgo S4 (Gemini): a veces el LLM no elige herramienta aunque la frase sea clara. La red de verbos lo
// recuperaba, pero SIN datos, y ofrecia las reuniones del lunes para "la reunion del jueves". Ahora el evento
// descrito se saca del propio texto: "la reunion del jueves", "la cita con el dentista"...
export function eventoDelTexto(texto: string): string | null {
  const m = texto.match(/\b(?:la|el)\s+((?:reuni[oó]n|cita|llamada|evento|clase)\s+(?:del?|con(?:\s+(?:el|la))?)\s+[a-záéíóúñ]{3,})/i);
  return m ? m[1] : null;
}

// 4 · Tipos: "60" -> 60; horas "10:00"; fechas AAAA-MM-DD
export function aEntero(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\s*\d+\s*$/.test(v) ? Number(v) : NaN;
  return Number.isInteger(n) ? n : null;
}

export function horaValida(h: unknown): string | null {
  if (typeof h !== "string") return null;
  const m = h.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

export function fechaValida(f: unknown): string | null {
  return typeof f === "string" && /^\d{4}-\d{2}-\d{2}$/.test(f) && !Number.isNaN(Date.parse(f)) ? f : null;
}

// 5 · Tildes: si el LLM escribe "Reunin", recuperamos la palabra tal como la escribio Whisper ("reunion" con tilde)
function distancia(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

export function repararTitulo(titulo: string, texto: string): string {
  const originales = texto.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 3);
  const arreglado = titulo.split(/(\s+)/).map((w) => {
    if (w.trim().length < 4) return w;
    const cand = originales.find((o) => sinTildes(o) !== sinTildes(w) && distancia(sinTildes(o), sinTildes(w)) <= 1);
    const igual = originales.find((o) => sinTildes(o) === sinTildes(w));
    const elegido = igual ?? cand;
    if (!elegido) return w;
    return w[0] === w[0].toUpperCase() ? elegido[0].toUpperCase() + elegido.slice(1) : elegido;
  });
  return arreglado.join("");
}

export type Correccion = { campo: string; antes: unknown; despues: unknown; motivo: string };

// Aplica todo lo anterior a los parametros del LLM y cuenta que ha cambiado y por que
export function normalizar(accion: string, p: Record<string, unknown>, texto: string, hoy = hoyEnMadrid()) {
  const q: Record<string, unknown> = { ...p };
  const cambios: Correccion[] = [];
  const cambiar = (campo: string, despues: unknown, motivo: string) => {
    cambios.push({ campo, antes: q[campo], despues, motivo });
    if (despues === undefined) delete q[campo];
    else q[campo] = despues;
  };
  if ("duracion_min" in q) {
    const n = aEntero(q.duracion_min);
    if (n === null) cambiar("duracion_min", undefined, "no es un numero");
    else if (n !== q.duracion_min) cambiar("duracion_min", n, "llego como texto");
  }
  const campoFecha = accion === "mover_evento" ? "nueva_fecha" : accion === "crear_evento" ? "fecha" : null;
  const campoHora = accion === "mover_evento" ? "nueva_hora" : accion === "crear_evento" ? "hora" : null;
  const dicha = fechaDelTexto(texto, hoy);
  if (campoFecha) {
    if (dicha && q[campoFecha] !== dicha)
      cambiar(campoFecha, dicha, `el usuario dijo un dia relativo: ${dicha} es ${diaSemana(dicha)}`);
    else if (q[campoFecha] !== undefined && !fechaValida(q[campoFecha])) cambiar(campoFecha, undefined, "formato de fecha no valido");
    else if (q[campoFecha] !== undefined && !mencionaFecha(texto, hoy)) cambiar(campoFecha, undefined, "el usuario no dijo ningun dia: inventado");
  }
  if (campoHora && q[campoHora] !== undefined) {
    const h = horaValida(q[campoHora]);
    if (!h) cambiar(campoHora, undefined, "formato de hora no valido");
    else if (!mencionaHora(texto)) cambiar(campoHora, undefined, "el usuario no dijo ninguna hora: inventada");
    else if (h !== q[campoHora]) cambiar(campoHora, h, "formato");
  }
  if (typeof q.titulo === "string") {
    const t = repararTitulo(q.titulo, texto);
    if (t !== q.titulo) cambiar("titulo", t, "se perdio una tilde");
    // Hallazgo S4: "crea una reunion hoy a las 9" -> titulo "Reunion hoy". El cuando va en la fecha, no en el titulo
    const sinCuando = String(q.titulo).replace(/\s+(para\s+)?(hoy|ma[nñ]ana|pasado ma[nñ]ana|esta tarde|esta noche)$/i, "").trim();
    if (sinCuando && sinCuando !== q.titulo) cambiar("titulo", sinCuando, "el dia no es parte del titulo");
  }
  if (typeof q.evento === "string" && !estaEnElTexto(q.evento, texto))
    cambiar("evento", undefined, "el usuario no menciono ese evento: inventado");
  return { parametros: q, cambios };
}
