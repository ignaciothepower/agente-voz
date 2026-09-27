import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { estadoDe, procesar } from "@/lib/agente";

// POST /api/agente  { texto }  ->  el turno completo: intencion, correcciones, llamada al MCP, resultado y respuesta.
// Sesion 3: AQUI el agente ya actua sobre Google Calendar (a traves del MCP).
export async function POST(req: NextRequest) {
  const { texto } = await req.json().catch(() => ({ texto: "" }));
  if (typeof texto !== "string" || !texto.trim())
    return NextResponse.json({ error: "No hay texto que interpretar." }, { status: 400 });
  if (texto.length > 1000) return NextResponse.json({ error: "El texto es demasiado largo." }, { status: 413 });
  const id = req.cookies.get("conversacion")?.value ?? randomUUID();
  const estado = estadoDe(id);
  try {
    const turno = await procesar(texto, estado);
    const res = NextResponse.json({ turno, log: estado.log, pendiente: estado.pendiente?.tipo ?? (estado.borrador ? "dato" : null) });
    res.cookies.set("conversacion", id, { httpOnly: true, sameSite: "lax", maxAge: 30 * 60, path: "/" });
    return res;
  } catch (e) {
    const m = (e as Error).message;
    return NextResponse.json({ error: /ollama|fetch failed/i.test(m) ? "El modelo no responde. ¿Está Ollama abierto?" : `No he podido hacerlo: ${m}` }, { status: 503 });
  }
}
