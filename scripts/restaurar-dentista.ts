// Vuelve a crear la cita del dentista: la borro por error la prueba del "lentista" (S3) y, a proposito y con confirmacion, la demo de la S4.
//     node --env-file=.env.local scripts/restaurar-dentista.ts
import { crearEventoRaw } from "../src/lib/google.ts";

const e = await crearEventoRaw("Cita con el dentista", "2026-09-29T10:30:00", "2026-09-29T11:15:00");
console.log("restaurada:", e.summary, e.start.dateTime);
