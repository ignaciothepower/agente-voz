import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { procesar } from "@/lib/agente";
import { COOKIE, escribirEstado, leerEstado } from "@/lib/sesion";

// POST /api/agente  { texto }  ->  el turno completo: intencion, correcciones, llamada al MCP, resultado y respuesta.
// Sesion 3: AQUI el agente ya actua sobre Google Calendar (a traves del MCP).
// Sesion 4: la memoria va en una cookie firmada (src/lib/sesion.ts), para que funcione igual en Vercel.
export async function POST(req: NextRequest) {
  const { texto } = await req.json().catch(() => ({ texto: "" }));
  if (typeof texto !== "string" || !texto.trim())
    return NextResponse.json({ error: "No hay texto que interpretar." }, { status: 400 });
  if (texto.length > 500) return NextResponse.json({ error: "El texto es demasiado largo." }, { status: 413 });
  const estado = leerEstado(req.cookies.get(COOKIE)?.value, randomUUID().slice(0, 8));
  try {
    const turno = await procesar(texto, estado);
    const res = NextResponse.json({ turno, log: estado.log, pendiente: estado.pendiente?.tipo ?? (estado.borrador ? "dato" : null) });
    res.cookies.set(COOKIE, escribirEstado(estado), { httpOnly: true, sameSite: "lax", secure: !!process.env.VERCEL, maxAge: 30 * 60, path: "/" });
    return res;
  } catch (e) {
    const m = (e as Error).message;
    return NextResponse.json({ error: /ollama|fetch failed/i.test(m) ? "El modelo no responde. ¿Está Ollama abierto?" : `No he podido hacerlo: ${m}` }, { status: 503 });
  }
}
