import { NextRequest, NextResponse } from "next/server";
import { huella } from "@/middleware";

// POST /api/acceso (formulario de /acceso) -> si la clave es buena, cookie "acceso" 30 dias y a la app
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const clave = String(form?.get("clave") ?? "");
  const buena = process.env.APP_CLAVE;
  await new Promise((r) => setTimeout(r, 400)); // freno barato contra probar claves a lo loco
  if (!buena || clave !== buena) return NextResponse.redirect(new URL("/acceso?error=1", req.url), 303);
  const res = NextResponse.redirect(new URL("/", req.url), 303);
  res.cookies.set("acceso", await huella(buena), { httpOnly: true, sameSite: "lax", secure: !!process.env.VERCEL, maxAge: 30 * 86_400, path: "/" });
  return res;
}
