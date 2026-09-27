// Sesion 3, paso 2: la validacion en codigo aplicada a las intenciones REALES que devolvio llama3.1 en la S1 y la S2.
// Sin LLM: son los JSON tal cual salieron. "Hoy" fijado al dia de las pruebas (domingo 2026-09-27) para que sea repetible.
//     node scripts/probar-validar.ts
import { diaSemana, normalizar } from "../src/lib/validar.ts";

const HOY = "2026-09-27";
const CASOS: [string, string, Record<string, unknown>][] = [
  ["Crea una reunión mañana a las diez con el equipo de marketing, por favor.", "crear_evento",
    { titulo: "Reunin con marketing", hora: "10:00", fecha: "2026-09-28", duracion_min: "60" }],
  ["He tenido un problema y te voy a pedir por favor si puedes mover la reunión del jueves a las cinco de la tarde. Gracias.", "mover_evento",
    { evento: "la reunion del jueves", nueva_fecha: "2026-09-30", nueva_hora: "17:00" }],
  ["muevela a mas tarde", "mover_evento",
    { evento: "la reunion del jueves", nueva_fecha: "2026-10-01", nueva_hora: "10:00" }],
  ["Ahí sí por cierto, crees una reunión mañana a las diez, tienes que ir a las diez de la mañana, no las once, mejor a las diez.", "crear_evento",
    { titulo: "Reunion", fecha: "2026-09-28", hora: "10:00", duracion_min: "60" }],
];

console.log(`Hoy: ${diaSemana(HOY)} ${HOY}\n`);
for (const [texto, accion, p] of CASOS) {
  const { parametros, cambios } = normalizar(accion, p, texto, HOY);
  console.log(`TEXTO   : ${texto}`);
  console.log(`LLM     : ${accion} ${JSON.stringify(p)}`);
  for (const c of cambios) console.log(`  ARREGLO ${c.campo}: ${JSON.stringify(c.antes)} -> ${JSON.stringify(c.despues)}   (${c.motivo})`);
  if (cambios.length === 0) console.log("  (nada que corregir)");
  console.log(`VALIDADO: ${accion} ${JSON.stringify(parametros)}\n`);
}
