// La memoria en cookie firmada (S4): lo que sale es lo que entra, y una cookie tocada a mano no vale
import { test } from "node:test";
import assert from "node:assert/strict";
import { escribirEstado, leerEstado } from "../src/lib/sesion.ts";
import { estadoNuevo } from "../src/lib/agente.ts";

test("ida y vuelta de la cookie", () => {
  const e = estadoNuevo("abc");
  e.pendiente = { tipo: "confirmar", tool: "borrar_evento", args: { id: "x1" }, resumen: "borrar algo", hasta: Date.now() + 60_000 };
  const vuelta = leerEstado(escribirEstado(e), "otro");
  assert.equal(vuelta.id, "abc");
  assert.deepEqual(vuelta.pendiente, e.pendiente);
});

test("una cookie manipulada se descarta", () => {
  const e = estadoNuevo("abc");
  const [datos, firma] = escribirEstado(e).split(".");
  const falso = JSON.parse(Buffer.from(datos, "base64url").toString());
  falso.estado.pendiente = { tipo: "confirmar", tool: "borrar_evento", args: { id: "otro" }, resumen: "", hasta: Date.now() + 60_000 };
  const cookie = `${Buffer.from(JSON.stringify(falso)).toString("base64url")}.${firma}`;
  const leido = leerEstado(cookie, "nuevo");
  assert.equal(leido.id, "nuevo");
  assert.equal(leido.pendiente, undefined);
});

test("la cookie no pasa de 4 KB aunque el historial sea largo", () => {
  const e = estadoNuevo("abc");
  e.log = Array.from({ length: 6 }, () => ({ usuario: "x".repeat(500), agente: "y".repeat(500) }));
  assert.ok(escribirEstado(e).length <= 3500);
});
