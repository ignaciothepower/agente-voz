// Paso 3 de la Sesion 2: pasar frases (ya transcritas) por el parser de intencion y ver el JSON y la respuesta.
//     node scripts/probar-intencion.ts "frase 1" "frase 2" ...
// Sin ejecutar nada en el calendario. Las frases van UNA detras de otra: el portatil no esta para paralelismos.
import { contextoFecha, interpretar } from "../src/lib/intencion.ts";
import { responder } from "../src/lib/respuesta.ts";

console.log(contextoFecha(), "\n");
for (const frase of process.argv.slice(2)) {
  const i = await interpretar(frase);
  console.log(`TEXTO     : ${frase}`);
  console.log(`INTENCION : ${JSON.stringify({ accion: i.accion, ...i.parametros })}   (${i.segundos} s)`);
  if (i.nota) console.log(`NOTA      : ${i.nota}`);
  console.log(`RESPUESTA : ${responder(i)}\n`);
}
