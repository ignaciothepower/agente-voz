import { NextRequest, NextResponse } from "next/server";
import { interpretar } from "@/lib/intencion";
import { responder } from "@/lib/respuesta";

// POST /api/intencion  { texto }  ->  { intencion, respuesta }   (no ejecuta nada en el calendario)
export async function POST(req: NextRequest) {
  const { texto } = await req.json().catch(() => ({ texto: "" }));
  if (typeof texto !== "string" || !texto.trim())
    return NextResponse.json({ error: "No hay texto que interpretar." }, { status: 400 });
  if (texto.length > 1000)
    return NextResponse.json({ error: "El texto es demasiado largo." }, { status: 413 });
  try {
    const intencion = await interpretar(texto);
    return NextResponse.json({ intencion, respuesta: responder(intencion) });
  } catch {
    return NextResponse.json({ error: "El modelo no responde. ¿Está Ollama abierto?" }, { status: 503 });
  }
}
