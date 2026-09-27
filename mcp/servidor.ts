// Servidor MCP del calendario. S1: esqueleto que solo anunciaba las tools. S3: cada tool llama DE VERDAD a Google Calendar.
// Las comprobaciones viven aqui (src/lib/calendario.ts): cualquier host que use este MCP queda protegido igual.
// Es el mismo concepto que el servidor MCP propio de AI Engineer S10, ahora en TypeScript.
//     node --env-file=.env.local mcp/servidor.ts     (habla MCP por stdin/stdout: lo arranca el host)
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { ACCIONES } from "../src/lib/acciones.ts";
import { borrar, crear, listar, mover, type Resultado } from "../src/lib/calendario.ts";

const servidor = new Server({ name: "calendario", version: "0.3.0" }, { capabilities: { tools: {} } });
const ID = { type: "string", description: "Id exacto del evento en Google Calendar. Lo pone el host cuando ya sabe cual es" };

// tools/list: el mismo esquema de acciones.ts; mover y borrar aceptan ademas el id exacto
servidor.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: ACCIONES.map((a) => ({
    name: a.nombre,
    description: a.descripcion,
    inputSchema: ["mover_evento", "borrar_evento"].includes(a.nombre)
      ? { ...a.parametros, properties: { ...a.parametros.properties, id: ID } }
      : a.parametros,
    annotations: { readOnlyHint: !a.destructiva, destructiveHint: a.destructiva },
  })),
}));

const EJECUTAR: Record<string, (p: Record<string, unknown>) => Promise<Resultado>> = {
  crear_evento: crear,
  listar_eventos: listar,
  mover_evento: (p) => mover(p, typeof p.id === "string" ? p.id : undefined),
  borrar_evento: (p) => borrar(p, typeof p.id === "string" ? p.id : undefined),
};

// tools/call: ejecuta y devuelve el resultado en JSON (ok, o el motivo por el que no se hizo)
servidor.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  const hacer = EJECUTAR[name];
  if (!hacer) return { isError: true, content: [{ type: "text", text: `No conozco la tool ${name}` }] };
  try {
    const r = await hacer(args as Record<string, unknown>);
    console.error(`[mcp] ${name} ${JSON.stringify(args)} -> ${r.ok ? "ok" : r.motivo}: ${r.texto}`);
    return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r };
  } catch (e) {
    console.error(`[mcp] ${name} ERROR ${(e as Error).message}`);
    return { isError: true, content: [{ type: "text", text: `Fallo al hablar con Google Calendar: ${(e as Error).message}` }] };
  }
});

await servidor.connect(new StdioServerTransport());
console.error("[mcp] servidor 'calendario' 0.3.0 listo por stdio (Google Calendar real)");
