// El HOST MCP: la app Next.js arranca el servidor del calendario una vez (proceso hijo por stdio) y le llama por MCP.
// Mismo patron que host_ollama.py de AI Engineer S10, en TypeScript.
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

type Global = { __mcpCalendario?: Promise<Client> };
const g = globalThis as Global; // en desarrollo Next recarga modulos: un solo servidor para toda la app

async function conectar(): Promise<Client> {
  const transporte = new StdioClientTransport({
    command: process.execPath, // el mismo node que ejecuta Next
    args: [path.join(process.cwd(), "mcp", "servidor.ts")],
    env: process.env as Record<string, string>, // las credenciales de Google viajan por el entorno, nunca por el codigo
    stderr: "inherit",
  });
  const cliente = new Client({ name: "agente-voz", version: "0.3.0" });
  await cliente.connect(transporte);
  transporte.onclose = () => { g.__mcpCalendario = undefined; }; // si el servidor muere, se reconecta en la siguiente llamada
  return cliente;
}

export async function llamarTool(nombre: string, args: Record<string, unknown>) {
  g.__mcpCalendario ??= conectar();
  const cliente = await g.__mcpCalendario;
  const r = await cliente.callTool({ name: nombre, arguments: args });
  const texto = (r.content as { type: string; text: string }[])[0]?.text ?? "";
  if (r.isError) throw new Error(texto);
  return JSON.parse(texto);
}
