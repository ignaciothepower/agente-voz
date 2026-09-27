// Las acciones que el agente puede hacer sobre el calendario, como esquema de herramientas (function calling).
// Es el contrato entre el LLM (que elige accion y rellena parametros) y el codigo que ejecuta.
// En la Sesion 3 este mismo esquema se convierte en las tools del servidor MCP.
// Sin imports y con sintaxis TypeScript "borrable": node 24 puede ejecutar este archivo directamente.

export type Accion = {
  nombre: "crear_evento" | "listar_eventos" | "mover_evento" | "borrar_evento";
  descripcion: string;       // el LLM elige la herramienta leyendo esto: cuanto mas claro, mejor
  destructiva: boolean;      // cambia tu calendario -> pedira confirmacion humana (Sesion 4)
  parametros: {
    type: "object";
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required: string[];
  };
};

const FECHA = { type: "string", description: "Fecha en formato AAAA-MM-DD (hoy, manana... ya resuelto a fecha)" };
const HORA = { type: "string", description: "Hora de inicio en formato HH:MM de 24 horas, hora de Madrid" };

export const ACCIONES: Accion[] = [
  {
    nombre: "crear_evento",
    descripcion: "Crea un evento nuevo en el calendario. Usala cuando el usuario quiera anadir, apuntar o programar una reunion, cita o recordatorio.",
    destructiva: true,
    parametros: {
      type: "object",
      properties: {
        titulo: { type: "string", description: "Titulo corto del evento, por ejemplo 'Reunion con marketing'" },
        fecha: FECHA,
        hora: HORA,
        duracion_min: { type: "integer", description: "Duracion en minutos. Si el usuario no la dice, 60" },
      },
      required: ["titulo", "fecha", "hora"],
    },
  },
  {
    nombre: "listar_eventos",
    descripcion: "Lista los eventos de un rango de fechas. Usala cuando el usuario pregunte que tiene, que hay o si esta libre.",
    destructiva: false,
    parametros: {
      type: "object",
      properties: {
        desde: { ...FECHA, description: "Primer dia del rango, AAAA-MM-DD" },
        hasta: { ...FECHA, description: "Ultimo dia del rango, AAAA-MM-DD (igual a desde si es un solo dia)" },
      },
      required: ["desde", "hasta"],
    },
  },
  {
    nombre: "mover_evento",
    descripcion: "Cambia la fecha y/o la hora de un evento que YA existe. Usala para mover, retrasar, adelantar o cambiar de hora.",
    destructiva: true,
    parametros: {
      type: "object",
      properties: {
        evento: { type: "string", description: "Como describe el usuario el evento, por ejemplo 'la reunion del jueves'" },
        nueva_fecha: FECHA,
        nueva_hora: HORA,
      },
      required: ["evento"],
    },
  },
  {
    nombre: "borrar_evento",
    descripcion: "Elimina un evento que ya existe. Usala solo si el usuario pide expresamente borrar, cancelar o quitar un evento.",
    destructiva: true,
    parametros: {
      type: "object",
      properties: {
        evento: { type: "string", description: "Como describe el usuario el evento, por ejemplo 'la cita con el dentista'" },
      },
      required: ["evento"],
    },
  },
];

// El mismo esquema en el formato "tools" que entienden Ollama, OpenAI o Gemini
export function comoTools() {
  return ACCIONES.map((a) => ({
    type: "function",
    function: { name: a.nombre, description: a.descripcion, parameters: a.parametros },
  }));
}

export function esDestructiva(nombre: string): boolean {
  return ACCIONES.find((a) => a.nombre === nombre)?.destructiva ?? true; // si no la conocemos: tratarla como peligrosa
}
