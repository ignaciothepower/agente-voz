// Servidor MCP del calendario. S1: esqueleto que solo anunciaba las tools. S3: cada tool llama DE VERDAD a Google Calendar.
// Las comprobaciones viven en src/lib/calendario.ts: cualquier host que use este MCP queda protegido igual.
// S4: se separa la definicion (este archivo) del transporte. En local se sirve por stdio (mcp/servidor.ts, proceso hijo);
// en Vercel no hay procesos hijo fiables, y el MISMO servidor se conecta al host en memoria (src/lib/mcp-cliente.ts).
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { ACCIONES } from "./acciones.ts";
import { borrar, crear, listar, mover, type Resultado } from "./calendario.ts";

const ID = { type: "string", description: "Id exacto del evento en Google Calendar. Lo pone el host cuando ya sabe cual es" };
const SIMULAR = { type: "boolean", description: "Ensayo: valida y devuelve lo que haria, sin tocar el calendario (para pedir confirmacion)" };

const EJECUTAR: Record<string, (p: Record<string, unknown>) => Promise<Resultado>> = {
  crear_evento: crear,
  listar_eventos: listar,
  mover_evento: (p) => mover(p, typeof p.id === "string" ? p.id : undefined),
  borrar_evento: (p) => borrar(p, typeof p.id === "string" ? p.id : undefined),
};

export function crearServidor(): Server {
  const servidor = new Server({ name: "calendario", version: "0.4.0" }, { capabilities: { tools: {} } });

  // tools/list: el mismo esquema de acciones.ts; mover y borrar aceptan el id exacto y las destructivas, el ensayo
  servidor.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: ACCIONES.map((a) => {
      const extra = { ...(["mover_evento", "borrar_evento"].includes(a.nombre) ? { id: ID } : {}), ...(a.destructiva ? { simular: SIMULAR } : {}) };
      return {
        name: a.nombre,
        description: a.descripcion,
        inputSchema: { ...a.parametros, properties: { ...a.parametros.properties, ...extra } },
        annotations: { readOnlyHint: !a.destructiva, destructiveHint: a.destructiva },
      };
    }),
  }));

  // tools/call: ejecuta y devuelve el resultado en JSON (ok, o el motivo por el que no se hizo)
  servidor.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args = {} } = req.params;
    const hacer = EJECUTAR[name];
    if (!hacer) return { isError: true, content: [{ type: "text", text: `No conozco la tool ${name}` }] };
    try {
      const r = await hacer(args as Record<string, unknown>);
      console.error(`[mcp] ${name} ${JSON.stringify(args)} -> ${r.ok ? (r.simulado ? "ensayo" : "ok") : r.motivo}: ${r.texto}`);
      return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r };
    } catch (e) {
      console.error(`[mcp] ${name} ERROR ${(e as Error).message}`);
      return { isError: true, content: [{ type: "text", text: `Fallo al hablar con Google Calendar: ${(e as Error).message}` }] };
    }
  });
  return servidor;
}
