// Cliente MCP minimo: arranca el servidor del calendario, lista sus tools y llama a una (sin tocar nada real).
//     node scripts/probar-mcp.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transporte = new StdioClientTransport({ command: process.execPath, args: ["mcp/servidor.ts"], stderr: "inherit" });
const cliente = new Client({ name: "probar-mcp", version: "0.1.0" });
await cliente.connect(transporte);

const info = cliente.getServerVersion();
console.log(`Conectado a '${info?.name}' v${info?.version} por stdio\n`);

const { tools } = await cliente.listTools();
console.log(`tools/list -> ${tools.length} tools`);
for (const t of tools) {
  const params = Object.keys((t.inputSchema.properties ?? {}) as object).join(", ");
  const req = (t.inputSchema.required ?? []).join(", ");
  console.log(`  ${t.annotations?.destructiveHint ? "!" : " "} ${t.name.padEnd(15)} (${params})  obligatorios: ${req}`);
}

console.log("\ntools/call crear_evento ...");
const r = await cliente.callTool({ name: "crear_evento", arguments: { titulo: "Reunion con marketing", fecha: "2026-09-28", hora: "10:00" } });
console.log(" ", (r.content as { text: string }[])[0].text);
await cliente.close();
