import { NextResponse } from "next/server";
import { idCalendario, listarEventos, NOMBRE_CALENDARIO, rangoDeHoy } from "@/lib/google";

// GET /api/calendario/hoy -> primera llamada de prueba: los eventos de hoy del calendario de demo
export async function GET() {
  try {
    const { desde, hasta } = rangoDeHoy();
    const eventos = await listarEventos(desde, hasta);
    return NextResponse.json({ calendario: NOMBRE_CALENDARIO, id: await idCalendario(), desde, hasta, total: eventos.length, eventos });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
