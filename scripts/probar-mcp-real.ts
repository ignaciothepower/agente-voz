// Sesion 3, paso 1: el MCP del calendario ya habla con Google. Llamadas que NO cambian nada (solo leen o se niegan).
//     node --env-file=.env.local scripts/probar-mcp-real.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transporte = new StdioClientTransport({ command: process.execPath, args: ["mcp/servidor.ts"], env: process.env as Record<string, string>, stderr: "inherit" });
const cliente = new Client({ name: "probar-mcp-real", version: "0.3.0" });
await cliente.connect(transporte);
console.log(`Conectado a '${cliente.getServerVersion()?.name}' v${cliente.getServerVersion()?.version}\n`);

const PRUEBAS: [string, Record<string, unknown>][] = [
  ["listar_eventos", { desde: "2026-09-27", hasta: "2026-09-27" }],
  ["borrar_evento", { evento: "la cita con el lentista" }],       // la frase 04 sin vocabulario: no existe
  ["mover_evento", { evento: "la reunion del jueves" }],          // sin hora: la localiza y dice que falta
  ["crear_evento", { titulo: "Prueba", fecha: "2026-09-28" }],    // sin hora: se niega
  ["crear_evento", { titulo: "Prueba", fecha: "2026-09-28", hora: "25:00" }], // hora imposible
];
for (const [tool, args] of PRUEBAS) {
  const r = await cliente.callTool({ name: tool, arguments: args });
  const j = JSON.parse((r.content as { text: string }[])[0].text);
  console.log(`tools/call ${tool} ${JSON.stringify(args)}`);
  console.log(`   -> ${j.ok ? "ok" : j.motivo}: ${j.texto}\n`);
}
await cliente.close();
