// Tests de la validacion en codigo (S3), con los fallos reales de la S2 como casos
import { test } from "node:test";
import assert from "node:assert/strict";
import { eventoDelTexto, fechaDelTexto, horaDelTexto, mencionaHora, normalizar, repararTitulo } from "../src/lib/validar.ts";

const HOY = "2026-09-27"; // domingo

test("el jueves es jueves (llama3.1 dijo miercoles 30)", () => {
  assert.equal(fechaDelTexto("mueve la reunión del jueves a las cinco", HOY), "2026-10-01");
  assert.equal(fechaDelTexto("crea una reunión mañana a las 10", HOY), "2026-09-28");
  assert.equal(fechaDelTexto("a las diez de la mañana", HOY), null); // "de la manana" no es "manana"
});

test("horas dichas y horas inventadas", () => {
  assert.equal(horaDelTexto("a las cinco de la tarde"), "17:00");
  assert.equal(horaDelTexto("mejor a las once"), "11:00");
  assert.ok(!mencionaHora("Oye, crea una reunión mañana")); // "una" no es la una (hallazgo S3)
  assert.ok(!mencionaHora("Ponle una hora de duración"));
});

test("normalizar quita la hora inventada y arregla la tilde perdida", () => {
  const { parametros, cambios } = normalizar("crear_evento", { titulo: "Reunin", fecha: "2026-09-28", hora: "08:00" }, "Oye, crea una reunión mañana", HOY);
  assert.equal(parametros.hora, undefined);
  assert.equal(parametros.titulo, "Reunión");
  assert.ok(cambios.some((c) => c.campo === "hora"));
  assert.equal(repararTitulo("Reunin con marketing", "Crea una reunión con marketing"), "Reunión con marketing");
});

test("el evento se saca del texto si el LLM no elige herramienta (hallazgo S4 con Gemini)", () => {
  assert.equal(eventoDelTexto("te voy a pedir por favor si puedes mover la reunión del jueves a las cinco de la tarde"), "reunión del jueves");
  assert.equal(eventoDelTexto("Borra la cita con el dentista."), "cita con el dentista");
  assert.equal(eventoDelTexto("Muévela a más tarde."), null);
});

test("el dia no se cuela en el titulo (hallazgo S4: 'Reunion hoy')", () => {
  const { parametros } = normalizar("crear_evento", { titulo: "Reunion hoy", fecha: "2026-09-27", hora: "09:00" }, "Crea una reunión hoy a las 9 de la mañana", HOY);
  assert.equal(parametros.titulo, "Reunión");
});
