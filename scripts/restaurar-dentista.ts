// Vuelve a crear la cita que borro por error la prueba del "lentista" (hallazgo de la Sesion 3).
//     node --env-file=.env.local scripts/restaurar-dentista.ts
import { crearEventoRaw } from "../src/lib/google.ts";

const e = await crearEventoRaw("Cita con el dentista", "2026-09-29T09:30:00", "2026-09-29T10:15:00");
console.log("restaurada:", e.summary, e.start.dateTime);
