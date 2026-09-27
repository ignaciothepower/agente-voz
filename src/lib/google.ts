// Google Calendar con fetch y OAuth 2.0 "a mano": sin la libreria googleapis, para ver cada paso.
// Las credenciales llegan SIEMPRE por variables de entorno (.env.local), nunca escritas en el codigo.

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/calendar/v3";

// Permiso minimo: "calendar.app.created" deja a la app crear SUS calendarios y gestionar eventos SOLO en ellos.
// Tu calendario principal y los demas quedan fuera de su alcance. Nada de Gmail, Drive, contactos...
export const SCOPES = ["https://www.googleapis.com/auth/calendar.app.created"];

export const ZONA = "Europe/Madrid";
export const NOMBRE_CALENDARIO = process.env.GOOGLE_CALENDARIO ?? "Agente de voz (demo)";

function variable(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta ${nombre} en .env.local`);
  return valor;
}

export function redirectUri(): string {
  return process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:3000/api/google/callback";
}

// 1 · Mandamos al usuario a Google para que de permiso (pantalla de consentimiento)
export function urlConsentimiento(state: string): string {
  const p = new URLSearchParams({
    client_id: variable("GOOGLE_CLIENT_ID"),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline", // queremos refresh_token: acceso sin volver a pedir permiso
    prompt: "consent",      // fuerza a Google a devolver el refresh_token aunque ya dieras permiso antes
    state,                  // valor aleatorio contra CSRF: lo comprobamos en el callback
  });
  return `${AUTH_URL}?${p}`;
}

// 2 · Google vuelve con un "code" de un solo uso: lo cambiamos por los tokens
export async function canjearCodigo(code: string) {
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: variable("GOOGLE_CLIENT_ID"),
      client_secret: variable("GOOGLE_CLIENT_SECRET"),
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  const datos = await r.json();
  if (!r.ok) throw new Error(`Google rechazo el codigo: ${datos.error}`);
  return datos as { access_token: string; refresh_token?: string; expires_in: number; scope: string };
}

// 3 · En cada uso: refresh_token (dura) -> access_token (dura 1 hora)
let cache: { token: string; caduca: number } | null = null;

export async function accessToken(): Promise<string> {
  if (cache && Date.now() < cache.caduca - 60_000) return cache.token;
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: variable("GOOGLE_CLIENT_ID"),
      client_secret: variable("GOOGLE_CLIENT_SECRET"),
      refresh_token: variable("GOOGLE_REFRESH_TOKEN"),
      grant_type: "refresh_token",
    }),
  });
  const datos = await r.json();
  if (!r.ok) throw new Error(`No se pudo renovar el token: ${datos.error}`);
  cache = { token: datos.access_token, caduca: Date.now() + datos.expires_in * 1000 };
  return cache.token;
}

async function api<T>(ruta: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${API}${ruta}`, {
    ...init,
    headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json", ...init.headers },
    cache: "no-store",
  });
  const datos = r.status === 204 ? {} : await r.json(); // DELETE responde 204 sin cuerpo
  if (!r.ok) throw new Error(`Calendar API ${r.status}: ${datos.error?.message ?? r.statusText}`);
  return datos as T;
}

// El agente solo toca SU calendario de demo, que crea el mismo al conectarse (ver /api/google/callback)
export async function idCalendario(): Promise<string> {
  if (!process.env.GOOGLE_CALENDAR_ID) throw new Error("Falta GOOGLE_CALENDAR_ID: conecta Google en /api/google/login");
  return process.env.GOOGLE_CALENDAR_ID;
}

export async function crearCalendario(): Promise<string> {
  const cal = await api<{ id: string }>("/calendars", {
    method: "POST",
    body: JSON.stringify({ summary: NOMBRE_CALENDARIO, timeZone: ZONA, description: "Calendario que gestiona el agente de voz" }),
  });
  return cal.id;
}

export type Evento = { id: string; titulo: string; inicio: string; fin: string; enlace?: string };

type EventoGoogle = {
  id: string;
  summary?: string;
  htmlLink?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
};

// Inicio y fin del dia de hoy en Madrid, en formato RFC 3339 con su desfase (+02:00 en verano)
export function rangoDeHoy(ahora = new Date()) {
  const dia = ahora.toLocaleDateString("sv-SE", { timeZone: ZONA }); // "2026-09-27"
  const desfase = ahora
    .toLocaleString("en-US", { timeZone: ZONA, timeZoneName: "longOffset" })
    .split("GMT")[1] || "+00:00";
  return { desde: `${dia}T00:00:00${desfase}`, hasta: `${dia}T23:59:59${desfase}` };
}

export async function listarEventos(desde: string, hasta: string): Promise<Evento[]> {
  const cal = encodeURIComponent(await idCalendario());
  const p = new URLSearchParams({ timeMin: desde, timeMax: hasta, singleEvents: "true", orderBy: "startTime", timeZone: ZONA });
  const r = await api<{ items: EventoGoogle[] }>(`/calendars/${cal}/events?${p}`);
  return r.items.map((e) => ({
    id: e.id,
    titulo: e.summary ?? "(sin titulo)",
    inicio: e.start.dateTime ?? e.start.date ?? "",
    fin: e.end.dateTime ?? e.end.date ?? "",
    enlace: e.htmlLink,
  }));
}

export async function crearEventoRaw(titulo: string, inicio: string, fin: string) {
  const cal = encodeURIComponent(await idCalendario());
  return api<EventoGoogle>(`/calendars/${cal}/events`, {
    method: "POST",
    body: JSON.stringify({ summary: titulo, start: { dateTime: inicio, timeZone: ZONA }, end: { dateTime: fin, timeZone: ZONA } }),
  });
}

// Sesion 3: cambiar la hora (y la duracion) de un evento que ya existe, y borrarlo
export async function actualizarEventoRaw(id: string, inicio: string, fin: string) {
  const cal = encodeURIComponent(await idCalendario());
  return api<EventoGoogle>(`/calendars/${cal}/events/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ start: { dateTime: inicio, timeZone: ZONA }, end: { dateTime: fin, timeZone: ZONA } }),
  });
}

export async function borrarEventoRaw(id: string) {
  const cal = encodeURIComponent(await idCalendario());
  await api(`/calendars/${cal}/events/${encodeURIComponent(id)}`, { method: "DELETE" });
}
