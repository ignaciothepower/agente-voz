// Sesion 4: la puerta. En produccion la URL es publica y el agente actua sobre UN calendario real (el tuyo):
// sin esto, cualquiera que adivine la URL podria crear y borrar tus eventos. Si APP_CLAVE esta definida, toda
// pagina y toda API exigen la cookie "acceso", que solo se consigue escribiendo la clave en /acceso.
// Corre en el runtime Edge: nada de node:crypto, se usa Web Crypto (crypto.subtle).
import { NextRequest, NextResponse } from "next/server";

export async function huella(clave: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`agente-voz:${clave}`));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function middleware(req: NextRequest) {
  const clave = process.env.APP_CLAVE;
  if (!clave) return NextResponse.next(); // en local, sin clave: la puerta esta abierta
  if (req.cookies.get("acceso")?.value === (await huella(clave))) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith("/api/"))
    return NextResponse.json({ error: "Necesitas la clave de acceso." }, { status: 401 });
  return NextResponse.redirect(new URL("/acceso", req.url));
}

export const config = {
  // todo menos la propia puerta, los estaticos de Next y el worker de Whisper
  matcher: ["/((?!acceso|api/acceso|_next/|favicon.ico|whisper-worker.js).*)"],
};
