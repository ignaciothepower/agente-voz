// Sesion 3 (y 4): una conversacion con el agente desde la terminal (mismo codigo que /api/agente, con memoria y MCP real).
//     node --env-file=.env.local scripts/conversacion.ts "frase 1" "frase 2" --- "otra conversacion" ...
// "---" empieza una conversacion nueva (memoria vacia). OJO: crea y mueve eventos DE VERDAD en el calendario de demo.
import { estadoNuevo as estadoDe, procesar } from "../src/lib/agente.ts";

let n = 1;
let estado = estadoDe(`terminal-${n}`);
console.log(`=== conversacion ${n}`);
for (const frase of process.argv.slice(2)) {
  if (frase === "---") {
    estado = estadoDe(`terminal-${++n}`);
    console.log(`\n=== conversacion ${n} (memoria vacia)`);
    continue;
  }
  const t = await procesar(frase, estado);
  console.log(`\nTU      : ${frase}`);
  if (t.intencion) console.log(`LLM     : ${t.intencion.accion ?? "ninguna"} ${JSON.stringify(t.intencion.parametros)}  (${t.intencion.segundos} s)`);
  else console.log(t.freno ? "LLM     : (no hace falta: frenado antes de llamar al LLM)" : "LLM     : (no hace falta: respuesta a la pregunta anterior)");
  for (const c of t.cambios) console.log(`VALIDADO: ${c.campo} ${JSON.stringify(c.antes)} -> ${c.despues === undefined ? "(fuera)" : JSON.stringify(c.despues)}  (${c.motivo})`);
  if (t.llamada) console.log(`MCP     : ${t.llamada.tool} ${JSON.stringify(t.llamada.args)}`);
  if (t.resultado) console.log(`RESULTADO: ${t.resultado.ok ? "ok" : t.resultado.motivo} · ${t.resultado.texto}`);
  if (t.estrategia) console.log(`ESTRATEGIA: ${t.estrategia}`);
  if (t.confirmacion) console.log(`CONFIRMA: ${t.confirmacion}`);
  if (t.freno) console.log(`FRENO   : ${t.freno}`);
  console.log(`AGENTE  : ${t.respuesta}`);
}
process.exit(0); // cierra tambien el servidor MCP hijo
