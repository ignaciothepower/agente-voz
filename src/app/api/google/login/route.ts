import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { urlConsentimiento } from "@/lib/google";

// GET /api/google/login -> redirige a la pantalla de consentimiento de Google
// S4: solo en local. En produccion el refresh_token ya esta en las variables de Vercel y nadie debe poder
// conectar OTRA cuenta de Google a este agente desde la URL publica.
export async function GET() {
  if (process.env.NODE_ENV !== "development")
    return NextResponse.json({ ok: false, error: "La conexion con Google se hace en local (npm run dev)" }, { status: 403 });
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(urlConsentimiento(state));
  // Guardamos el state en una cookie httpOnly para comprobar en el callback que la vuelta es nuestra
  res.cookies.set("oauth_state", state, { httpOnly: true, sameSite: "lax", maxAge: 600, path: "/" });
  return res;
}
