// Etapa 5: la frase que el agente le dice al usuario. Corta, natural y SIN otro LLM (cero segundos, cero coste).
// OJO: esto lo LEE en voz alta el navegador. Sin tildes, "manana" suena "ma-na-na": aqui si, espanol correcto.
// En la Sesion 2 el agente solo confirma que ha entendido: todavia no toca el calendario.
import type { Intencion } from "./intencion.ts";

const ZONA = "Europe/Madrid";

function fechaHablada(iso?: unknown): string {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const d = new Date(`${iso}T12:00:00`);
  const hoy = new Date().toLocaleDateString("sv-SE", { timeZone: ZONA });
  const manana = new Date(Date.now() + 86_400_000).toLocaleDateString("sv-SE", { timeZone: ZONA });
  if (iso === hoy) return "hoy";
  if (iso === manana) return "mañana";
  return `el ${d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric" })}`;
}

function horaHablada(h?: unknown): string {
  if (typeof h !== "string" || !/^\d{1,2}:\d{2}$/.test(h)) return "";
  const [hh, mm] = h.split(":").map(Number);
  return mm === 0 ? `a las ${hh}` : `a las ${hh}:${String(mm).padStart(2, "0")}`;
}

export function responder(i: Intencion): string {
  const p = i.parametros;
  const cuando = [fechaHablada(p.fecha ?? p.nueva_fecha ?? p.desde), horaHablada(p.hora ?? p.nueva_hora)].filter(Boolean).join(" ");
  switch (i.accion) {
    case "crear_evento":
      return `Entendido: quieres crear "${p.titulo ?? "un evento"}" ${cuando}. De momento solo lo he entendido, todavía no lo apunto.`;
    case "listar_eventos":
      return `Entendido: quieres saber lo que tienes ${cuando || "en esas fechas"}. En la próxima sesión te lo leeré.`;
    case "mover_evento":
      return `Entendido: quieres mover ${p.evento ?? "un evento"}${cuando ? ` para ${cuando}` : ""}. Todavía no lo muevo.`;
    case "borrar_evento":
      return `Entendido: quieres borrar ${p.evento ?? "un evento"}. Tranquilo, todavía no borro nada.`;
    default:
      return "Solo puedo ayudarte con tu calendario: crear, consultar, mover o borrar eventos.";
  }
}
