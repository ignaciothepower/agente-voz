import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { urlConsentimiento } from "@/lib/google";

// GET /api/google/login -> redirige a la pantalla de consentimiento de Google
export async function GET() {
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(urlConsentimiento(state));
  // Guardamos el state en una cookie httpOnly para comprobar en el callback que la vuelta es nuestra
  res.cookies.set("oauth_state", state, { httpOnly: true, sameSite: "lax", maxAge: 600, path: "/" });
  return res;
}
