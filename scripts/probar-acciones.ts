// Paso 4 de la Sesion 1: comprobar que un LLM local entiende nuestro esquema de acciones.
// Le damos las 4 tools a llama3.1 (Ollama) y una frase; NO ejecutamos nada, solo miramos que elige.
//     node scripts/probar-acciones.ts "crea una reunion manana a las diez con marketing"
import { ACCIONES, comoTools, esDestructiva } from "../src/lib/acciones.ts";

const frase = process.argv[2] ?? "crea una reunion manana a las diez con el equipo de marketing";
const hoy = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });

console.log("ESQUEMA:", ACCIONES.map((a) => `${a.nombre}${a.destructiva ? " (destructiva)" : ""}`).join(", "));
console.log("FRASE  :", frase);

const t0 = Date.now();
const r = await fetch("http://localhost:11434/api/chat", {
  method: "POST",
  body: JSON.stringify({
    model: "llama3.1",
    stream: false,
    keep_alive: 0, // descarga el modelo al terminar: el portatil lo agradece
    options: { temperature: 0, num_predict: 200 },
    tools: comoTools(),
    messages: [
      { role: "system", content: `Eres un asistente de calendario. Hoy es ${hoy} (zona Europe/Madrid). Usa las herramientas.` },
      { role: "user", content: frase },
    ],
  }),
});
const datos = await r.json();
const llamadas = datos.message?.tool_calls ?? [];
console.log(`\nllama3.1 respondio en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
if (llamadas.length === 0) console.log("No eligio ninguna herramienta. Texto:", datos.message?.content);
for (const ll of llamadas) {
  const { name, arguments: args } = ll.function;
  console.log(`\nHERRAMIENTA ELEGIDA: ${name}  ->  ${esDestructiva(name) ? "DESTRUCTIVA: pedira confirmacion" : "solo lectura: va directa"}`);
  console.log(JSON.stringify(args, null, 2));
}
console.log("\n(no se ha ejecutado nada en el calendario: eso llega en la Sesion 3)");
