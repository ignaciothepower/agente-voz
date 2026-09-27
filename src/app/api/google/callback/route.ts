import { readFile, writeFile } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { canjearCodigo, crearCalendario } from "@/lib/google";

// GET /api/google/callback?code=...&state=...  (Google vuelve aqui tras el consentimiento)
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");
  if (error) return NextResponse.json({ ok: false, error: `Permiso denegado: ${error}` }, { status: 400 });
  if (!code || !state || state !== req.cookies.get("oauth_state")?.value)
    return NextResponse.json({ ok: false, error: "state no coincide (posible CSRF)" }, { status: 400 });

  const tokens = await canjearCodigo(code);
  if (!tokens.refresh_token)
    return NextResponse.json({ ok: false, error: "Google no devolvio refresh_token" }, { status: 400 });

  // Solo en desarrollo: guardamos el refresh_token en .env.local (que esta en .gitignore).
  // En produccion (Sesion 4) ira en las variables de entorno de la plataforma.
  if (process.env.NODE_ENV !== "development")
    return NextResponse.json({ ok: false, error: "guardar tokens solo en desarrollo" }, { status: 403 });
  await guardarEnEnv("GOOGLE_REFRESH_TOKEN", tokens.refresh_token);

  // La primera vez, la app crea su propio calendario: es el UNICO que podra tocar
  if (!process.env.GOOGLE_CALENDAR_ID) await guardarEnEnv("GOOGLE_CALENDAR_ID", await crearCalendario());

  const res = NextResponse.redirect(new URL("/?conectado=1", req.url));
  res.cookies.delete("oauth_state");
  return res;
}

async function guardarEnEnv(clave: string, valor: string) {
  const ruta = ".env.local";
  const actual = await readFile(ruta, "utf8").catch(() => "");
  const resto = actual
    .split(/\r?\n/)
    .filter((l) => !l.startsWith(`${clave}=`))
    .join("\n")
    .trimEnd();
  await writeFile(ruta, `${resto}\n${clave}=${valor}\n`);
  process.env[clave] = valor;
}
