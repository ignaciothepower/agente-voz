// El HOST MCP: la app Next.js se conecta al servidor del calendario y le llama por MCP.
// Mismo patron que host_ollama.py de AI Engineer S10, en TypeScript.
// S4: dos transportes para el MISMO protocolo. En local, proceso hijo por stdio. En Vercel (funciones serverless,
// sin procesos hijo fiables) el servidor vive en el mismo proceso y se habla con el por un par de tuberias en memoria.
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { crearServidor } from "./mcp-servidor.ts";

type Global = { __mcpCalendario?: Promise<Client> };
const g = globalThis as Global; // en desarrollo Next recarga modulos: un solo servidor para toda la app

export const transporteMcp = () => (process.env.MCP_TRANSPORTE ?? (process.env.VERCEL ? "memoria" : "stdio"));

async function conectar(): Promise<Client> {
  const cliente = new Client({ name: "agente-voz", version: "0.4.0" });
  if (transporteMcp() === "memoria") {
    const [lado_cliente, lado_servidor] = InMemoryTransport.createLinkedPair();
    await crearServidor().connect(lado_servidor);
    await cliente.connect(lado_cliente);
    return cliente;
  }
  const transporte = new StdioClientTransport({
    command: process.execPath, // el mismo node que ejecuta Next
    args: [path.join(process.cwd(), "mcp", "servidor.ts")],
    env: process.env as Record<string, string>, // las credenciales de Google viajan por el entorno, nunca por el codigo
    stderr: "inherit",
  });
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
