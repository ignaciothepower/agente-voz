// S4: la misma frase a los dos LLM (llama3.1 en local y Gemini en produccion), para comparar intencion y tiempo.
//     LLM=gemini node --env-file=.env.local scripts/probar-intencion-llm.ts "frase"
import { interpretar } from "../src/lib/intencion.ts";

for (const frase of process.argv.slice(2)) {
  const i = await interpretar(frase);
  console.log(`FRASE : ${frase}`);
  console.log(`MODELO: ${i.modelo} (${i.segundos} s)`);
  console.log(i.accion ? `TOOL  : ${i.accion} ${JSON.stringify(i.parametros)}` : `TEXTO : ${i.nota || "(vacio)"}`);
  console.log("");
}
