// Servidor MCP del calendario servido por stdio (lo arranca el host como proceso hijo, o cualquier cliente MCP).
// La definicion de las tools esta en src/lib/mcp-servidor.ts; aqui solo se elige el transporte.
//     node --env-file=.env.local mcp/servidor.ts     (habla MCP por stdin/stdout: lo arranca el host)
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { crearServidor } from "../src/lib/mcp-servidor.ts";

await crearServidor().connect(new StdioServerTransport());
console.error("[mcp] servidor 'calendario' 0.4.0 listo por stdio (Google Calendar real)");
