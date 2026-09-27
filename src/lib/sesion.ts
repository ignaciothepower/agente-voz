// Sesion 4: la memoria corta de la conversacion viaja en una cookie FIRMADA en vez de vivir en la RAM del servidor.
// Por que: en Vercel cada peticion puede caer en una instancia distinta de la funcion (o en una recien arrancada);
// un Map en memoria perderia el "¿confirmas?" entre la pregunta y el "si". La firma (HMAC-SHA256 con APP_SECRETO)
// impide que alguien fabrique un estado a mano, por ejemplo una confirmacion pendiente que nunca pidio el agente.
// Ojo: firmada no es cifrada. El contenido se puede leer (son tus propios eventos), pero no cambiar.
import { createHmac, timingSafeEqual } from "node:crypto";
import { estadoNuevo, type Estado } from "./agente.ts";

export const COOKIE = "conversacion";
const MAX_BYTES = 3500; // los navegadores aceptan unos 4 KB por cookie
const DURACION_MS = 30 * 60_000;

function secreto(): string {
  const s = process.env.APP_SECRETO;
  if (s && s.length >= 32) return s;
  if (process.env.VERCEL) throw new Error("Falta APP_SECRETO (32 caracteres o mas) en las variables de Vercel");
  return "solo-para-desarrollo-local-no-usar-en-produccion";
}

const firma = (datos: string) => createHmac("sha256", secreto()).update(datos).digest("base64url");

export function leerEstado(valor: string | undefined, id: string): Estado {
  if (!valor) return estadoNuevo(id);
  const [datos, f] = valor.split(".");
  const esperada = firma(datos ?? "");
  if (!f || f.length !== esperada.length || !timingSafeEqual(Buffer.from(f), Buffer.from(esperada))) return estadoNuevo(id); // manipulada
  const { hasta, estado } = JSON.parse(Buffer.from(datos, "base64url").toString("utf8")) as { hasta: number; estado: Estado };
  return hasta > Date.now() ? estado : estadoNuevo(id);
}

export function escribirEstado(estado: Estado): string {
  // Lo que no hace falta recordar se quita: los enlaces de los eventos y el historial mas antiguo
  const ligero = (ev?: Estado["ultimo"]) => (ev ? { ...ev, enlace: undefined } : undefined);
  const e: Estado = {
    ...estado,
    ultimo: ligero(estado.ultimo),
    pendiente: estado.pendiente?.tipo === "elegir" ? { ...estado.pendiente, opciones: estado.pendiente.opciones.map((o) => ligero(o)!) } : estado.pendiente,
  };
  let valor = "";
  for (let n = e.log.length; n >= 0; n--) {
    const datos = Buffer.from(JSON.stringify({ hasta: Date.now() + DURACION_MS, estado: { ...e, log: n ? e.log.slice(-n) : [] } })).toString("base64url");
    valor = `${datos}.${firma(datos)}`;
    if (valor.length <= MAX_BYTES) break;
  }
  return valor;
}
