// S4: ¿que frases cuentan como "si"? La regla de la S3 contra la de la S4, con las 12 grabaciones reales
// transcritas por Whisper. Si hay una confirmacion pendiente, una frase que cuenta como "si" EJECUTA la accion.
//     node scripts/probar-confirmacion.ts ../work-p2/out/transcripciones.json
import { readFileSync } from "node:fs";
import { esAfirmacion, esNegacion } from "../src/lib/guardarrailes.ts";
import { sinTildes } from "../src/lib/validar.ts";

const reglaS3 = (t: string) => /\b(si|vale|confirm|claro|adelante|hazlo|ok)/.test(sinTildes(t)); // resolverPendiente de la S3

const { audios } = JSON.parse(readFileSync(process.argv[2], "utf8")) as { audios: Record<string, { texto: string }> };
console.log("frase | regla S3 | regla S4 | texto");
for (const [n, { texto }] of Object.entries(audios).sort(([a], [b]) => a.localeCompare(b))) {
  const s3 = reglaS3(texto) ? "SI" : "-";
  const s4 = esAfirmacion(texto) ? "SI" : esNegacion(texto) ? "NO" : "-";
  const aviso = s3 === "SI" && s4 !== "SI" ? "   <- con la S3 esto confirmaba" : "";
  console.log(`${n} | ${s3.padEnd(8)} | ${s4.padEnd(8)} | ${texto.slice(0, 70)}${texto.length > 70 ? "..." : ""}${aviso}`);
}
