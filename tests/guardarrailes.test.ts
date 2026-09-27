// Tests de los frenos (S4). Se ejecutan con el runner de node, sin librerias: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { esAfirmacion, esNegacion, revisarDatos, revisarMasivo, revisarRitmo, LIMITES } from "../src/lib/guardarrailes.ts";

const AHORA = new Date("2026-09-27T16:00:00+02:00"); // domingo 27, 16:00 en Madrid

test("no deja crear en el pasado", () => {
  assert.equal(revisarDatos({ fecha: "2026-09-27", hora: "10:00" }, AHORA)?.freno, "pasado");
  assert.equal(revisarDatos({ fecha: "2026-09-26", hora: "18:00" }, AHORA)?.freno, "pasado");
  assert.equal(revisarDatos({ fecha: "2026-09-27", hora: "17:00" }, AHORA), null);
});

test("duraciones razonables y fechas no demasiado lejanas", () => {
  assert.equal(revisarDatos({ fecha: "2026-09-28", hora: "10:00", duracion: 3 }, AHORA)?.freno, "duracion");
  assert.equal(revisarDatos({ fecha: "2026-09-28", hora: "10:00", duracion: 4320 }, AHORA)?.freno, "duracion");
  assert.equal(revisarDatos({ fecha: "2026-09-28", hora: "10:00", duracion: "60" }, AHORA), null); // "60" como texto (hallazgo S2)
  assert.equal(revisarDatos({ fecha: "2028-01-10", hora: "10:00" }, AHORA)?.freno, "lejos");
});

test("limite de cambios por ventana de tiempo", () => {
  const t = AHORA.getTime();
  const hechas = Array.from({ length: LIMITES.cambiosPorVentana }, (_, i) => t - i * 60_000);
  assert.equal(revisarRitmo(hechas, t)?.freno, "ritmo");
  assert.equal(revisarRitmo(hechas, t + LIMITES.ventanaMin * 60_000), null); // pasada la ventana, vuelve a dejar
  assert.equal(revisarRitmo([], t), null);
});

test("borrar en bloque se frena", () => {
  assert.equal(revisarMasivo("Borra todos los eventos de la semana")?.freno, "masivo");
  assert.equal(revisarMasivo("cancela todas las reuniones")?.freno, "masivo");
  assert.equal(revisarMasivo("vacía mi calendario")?.freno, "masivo");
  assert.equal(revisarMasivo("Borra la cita con el dentista"), null);
});

test("solo un si claro vale como confirmacion", () => {
  for (const si of ["Sí, confirmado.", "sí", "Vale", "Adelante, hazlo", "ok"]) assert.ok(esAfirmacion(si), si);
  for (const no of ["No. Cancela.", "no", "Mejor no", "si puedes, mueve la reunion del jueves a las cinco de la tarde"])
    assert.ok(!esAfirmacion(no), no);
  assert.ok(esNegacion("No. Cancela."));
  assert.ok(!esNegacion("Sí, confirmado."));
});
