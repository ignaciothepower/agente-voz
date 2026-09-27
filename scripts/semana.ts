// Los eventos REALES del calendario de demo esta semana, en JSON (para dibujar la vista de la semana en las slides).
//     node --env-file=.env.local scripts/semana.ts 2026-09-27 2026-10-03
import { listarEventos } from "../src/lib/google.ts";

const [desde, hasta] = process.argv.slice(2);
const eventos = await listarEventos(`${desde}T00:00:00+02:00`, `${hasta}T23:59:59+02:00`);
console.log(JSON.stringify(eventos.map(({ titulo, inicio, fin }) => ({ titulo, inicio, fin })), null, 1));
