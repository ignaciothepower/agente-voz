// S4: nada sensible en el repositorio. Busca en los archivos que git va a subir las huellas tipicas de
// credenciales (Google OAuth, claves de API de Google/Gemini, refresh tokens...). Lo ejecuta el CI en cada push.
//     node scripts/secretos.mjs
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const PATRONES = [
  ["secreto de cliente OAuth de Google", /GOCSPX-[\w-]{10,}/],
  ["clave de API de Google / Gemini", /AIza[\w-]{30,}/],
  ["refresh token de Google", /\b1\/\/0[\w-]{20,}/],
  ["access token de Google", /\bya29\.[\w-]{20,}/],
  ["clave privada", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["variable con valor en un .env", /^(GOOGLE_CLIENT_SECRET|GOOGLE_REFRESH_TOKEN|GEMINI_API_KEY|APP_SECRETO|APP_CLAVE)=\S+/m],
];

// Lo que git subiria: lo ya versionado y lo nuevo que no esta en .gitignore
const archivos = execSync("git ls-files --cached --others --exclude-standard", { encoding: "utf8" }).split("\n").filter(Boolean);
let fallos = 0;
for (const a of archivos) {
  if (/\.(png|jpg|ico|woff2?|m4a|wav|webm)$/i.test(a)) continue;
  let texto;
  try { texto = readFileSync(a, "utf8"); } catch { continue; }
  for (const [nombre, re] of PATRONES) {
    if (re.test(texto)) { console.error(`SECRETO? ${a}: ${nombre}`); fallos++; }
  }
}
console.log(`${archivos.length} archivos revisados, ${fallos} sospechosos`);
process.exit(fallos ? 1 : 0);
