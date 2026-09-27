import { NextRequest, NextResponse } from "next/server";

const STT = process.env.STT_URL ?? "http://127.0.0.1:8765";
const MAX_BYTES = 10 * 1024 * 1024; // el mismo limite que el servicio de Whisper

// POST /api/transcribir  (FormData con el campo "audio")  ->  { texto, duracion_audio, segundos }
// El navegador no habla con Whisper directamente: pasa por aqui, que es donde se valida.
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0)
    return NextResponse.json({ error: "No ha llegado audio. ¿Has hablado?" }, { status: 400 });
  if (audio.size > MAX_BYTES)
    return NextResponse.json({ error: "El audio es demasiado largo (máximo 10 MB)." }, { status: 413 });

  const t0 = Date.now();
  let r: Response;
  try {
    r = await fetch(`${STT}/transcribir`, { method: "POST", body: Buffer.from(await audio.arrayBuffer()) });
  } catch {
    return NextResponse.json({ error: "El servicio de Whisper no responde. ¿Está arrancado (python stt/servidor.py)?" }, { status: 503 });
  }
  const datos = await r.json();
  if (!r.ok) return NextResponse.json({ error: "No he podido entender el audio. Prueba otra vez." , detalle: datos.error }, { status: r.status });
  if (!datos.texto) return NextResponse.json({ error: "No he oído nada. Habla un poco más cerca del micrófono." }, { status: 422 });
  return NextResponse.json({ ...datos, bytes: audio.size, tipo: audio.type, total_s: (Date.now() - t0) / 1000 });
}
