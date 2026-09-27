// Permisos minimos en accion: con "calendar.app.created" intentamos leer tu calendario PRINCIPAL.
//     node --env-file=.env.local scripts/probar-permisos.ts
import { accessToken } from "../src/lib/google.ts";

const token = await accessToken();
for (const [nombre, cal] of [["calendario de demo (creado por la app)", process.env.GOOGLE_CALENDAR_ID!], ["tu calendario principal", "primary"]]) {
  const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal)}/events?maxResults=1`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const datos = await r.json();
  console.log(`${nombre.padEnd(40)} -> HTTP ${r.status} ${r.ok ? "OK" : datos.error?.message}`);
}
