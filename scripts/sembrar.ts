// Mete unos eventos de ejemplo en el calendario de demo (hoy y esta semana) para poder probar el agente.
//     node --env-file=.env.local scripts/sembrar.ts
import { crearEventoRaw, listarEventos, rangoDeHoy, ZONA } from "../src/lib/google.ts";

// Fecha de dentro de N dias en Madrid, como "2026-09-27"
function dia(n: number): string {
  return new Date(Date.now() + n * 86_400_000).toLocaleDateString("sv-SE", { timeZone: ZONA });
}
const { desde } = rangoDeHoy();
const desfase = desde.slice(19); // "+02:00"

// Proximo jueves (para "mueve la reunion del jueves...")
const hoySemana = new Date().getDay(); // 0 domingo ... 4 jueves
const hastaJueves = (4 - hoySemana + 7) % 7 || 7;

const EVENTOS: [string, string, string, string][] = [
  ["Revision del temario", dia(0), "10:00", "11:00"],
  ["Llamada con Laura", dia(0), "17:00", "17:30"],
  ["Preparar clase del agente de voz", dia(0), "19:30", "20:30"],
  ["Cita con el dentista", dia(2), "09:30", "10:15"],
  ["Reunion de equipo", dia(hastaJueves), "12:00", "13:00"],
];

for (const [titulo, fecha, ini, fin] of EVENTOS) {
  await crearEventoRaw(titulo, `${fecha}T${ini}:00${desfase}`, `${fecha}T${fin}:00${desfase}`);
  console.log(`creado: ${fecha} ${ini}-${fin}  ${titulo}`);
}
const hoy = await listarEventos(rangoDeHoy().desde, rangoDeHoy().hasta);
console.log(`\nHoy hay ${hoy.length} eventos en el calendario de demo`);
