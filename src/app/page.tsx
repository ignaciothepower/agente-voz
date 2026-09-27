import { listarEventos, NOMBRE_CALENDARIO, rangoDeHoy, ZONA, type Evento } from "@/lib/google";
import { ACCIONES } from "@/lib/acciones";

export const dynamic = "force-dynamic";

const ETAPAS = [
  { n: 1, nombre: "Captura", detalle: "Navegador · MediaRecorder", sesion: "S2" },
  { n: 2, nombre: "Transcripcion", detalle: "Whisper local · 16 kHz mono", sesion: "S1" },
  { n: 3, nombre: "Intencion", detalle: "llama3.1 · JSON", sesion: "S2" },
  { n: 4, nombre: "Accion", detalle: "MCP · Google Calendar", sesion: "S3" },
  { n: 5, nombre: "Respuesta", detalle: "Texto + voz", sesion: "S2-S4" },
];

function hora(iso: string) {
  return new Date(iso).toLocaleTimeString("es-ES", { timeZone: ZONA, hour: "2-digit", minute: "2-digit" });
}

async function eventosDeHoy(): Promise<{ eventos?: Evento[]; error?: string }> {
  if (!process.env.GOOGLE_REFRESH_TOKEN) return { error: "Sin conectar con Google" };
  try {
    const { desde, hasta } = rangoDeHoy();
    return { eventos: await listarEventos(desde, hasta) };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export default async function Inicio() {
  const { eventos, error } = await eventosDeHoy();
  const hoy = new Date().toLocaleDateString("es-ES", { timeZone: ZONA, weekday: "long", day: "numeric", month: "long" });
  return (
    <main className="mx-auto max-w-4xl px-6 py-10 font-sans text-slate-800">
      <p className="text-sm font-semibold uppercase tracking-widest text-indigo-600">Agente de voz · Sesion 1</p>
      <h1 className="mt-1 text-3xl font-bold">Tu asistente de calendario</h1>
      <p className="mt-2 text-slate-600">Hablas, te entiende y gestiona tu calendario. Hoy montamos las piezas.</p>

      <section className="mt-8 grid grid-cols-5 gap-2">
        {ETAPAS.map((e) => (
          <div key={e.n} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">{e.n}</span>
              <span className="text-xs text-slate-400">{e.sesion}</span>
            </div>
            <p className="mt-2 font-semibold">{e.nombre}</p>
            <p className="text-xs text-slate-500">{e.detalle}</p>
          </div>
        ))}
      </section>

      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Hoy en «{NOMBRE_CALENDARIO}»</h2>
            <p className="text-sm text-slate-500 first-letter:uppercase">{hoy}</p>
          </div>
          {error ? (
            <a href="/api/google/login" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
              Conectar Google Calendar
            </a>
          ) : (
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">Conectado</span>
          )}
        </div>
        {error && <p className="mt-4 text-sm text-slate-500">{error}</p>}
        {eventos && eventos.length === 0 && <p className="mt-4 text-sm text-slate-500">No tienes nada hoy.</p>}
        {eventos && eventos.length > 0 && (
          <ul className="mt-4 divide-y divide-slate-100">
            {eventos.map((ev) => (
              <li key={ev.id} className="flex items-center gap-4 py-2">
                <span className="w-28 font-mono text-sm text-indigo-700">{hora(ev.inicio)} - {hora(ev.fin)}</span>
                <span>{ev.titulo}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Lo que el agente podra hacer</h2>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {ACCIONES.map((a) => (
            <div key={a.nombre} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <code className="font-semibold text-slate-900">{a.nombre}</code>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${a.destructiva ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-700"}`}>
                  {a.destructiva ? "pide confirmacion" : "solo lectura"}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-600">{a.descripcion}</p>
              <p className="mt-2 font-mono text-xs text-slate-400">{Object.keys(a.parametros.properties).join(" · ")}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
