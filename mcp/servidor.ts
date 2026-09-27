// Servidor MCP del calendario (esqueleto de la Sesion 1): expone las 4 acciones de src/lib/acciones.ts como tools.
// Hoy solo las ANUNCIA; en la Sesion 3 cada tool llamara de verdad a Google Calendar.
// Es el mismo concepto que el servidor MCP propio de AI Engineer S10, ahora en TypeScript.
//     node mcp/servidor.ts            (habla MCP por stdin/stdout: lo arranca el cliente, no se usa a mano)
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { ACCIONES, esDestructiva } from "../src/lib/acciones.ts";

const servidor = new Server({ name: "calendario", version: "0.1.0" }, { capabilities: { tools: {} } });

// tools/list: el cliente pregunta "que sabes hacer?" y le damos el esquema (una sola fuente: acciones.ts)
servidor.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: ACCIONES.map((a) => ({
    name: a.nombre,
    description: a.descripcion,
    inputSchema: a.parametros,
    // pista estandar de MCP: la tool cambia cosas y el host deberia pedir confirmacion
    annotations: { readOnlyHint: !a.destructiva, destructiveHint: a.destructiva },
  })),
}));

// tools/call: de momento no ejecuta nada, solo dice que recibio (Sesion 3: llamada real a Google Calendar)
servidor.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  if (!ACCIONES.some((a) => a.nombre === name))
    return { isError: true, content: [{ type: "text", text: `No conozco la tool ${name}` }] };
  return {
    content: [{
      type: "text",
      text: `[esqueleto] recibida ${name}(${JSON.stringify(args)})${esDestructiva(name) ? " - destructiva" : ""}. ` +
        "Todavia no toco el calendario: eso llega en la Sesion 3.",
    }],
  };
});

await servidor.connect(new StdioServerTransport());
console.error("[mcp] servidor 'calendario' listo por stdio"); // stderr: stdout es solo para el protocolo
