"""Cliente MCP 'a pelo': arranca un servidor por STDIO y enseña cada mensaje JSON-RPC.

Uso:  python mcp/cliente_jsonrpc.py mcp/servidor.ts [list|call NOMBRE JSON]...
Reciclado de AI Engineer S10 (mcp-server/cliente_jsonrpc.py): ahora tambien arranca servidores .ts con node.
Hace lo mismo que cualquier host MCP por debajo: initialize -> tools/list -> tools/call.
"""
import json
import subprocess
import sys

servidor = sys.argv[1]
ordenes = sys.argv[2:] or ["list"]
comando = ["node", servidor] if servidor.endswith((".ts", ".js")) else [sys.executable, servidor]
proc = subprocess.Popen(comando, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE, text=True, encoding="utf-8")
siguiente_id = 0


def enviar(metodo, params=None, notificacion=False):
    global siguiente_id
    msg = {"jsonrpc": "2.0", "method": metodo}
    if params is not None:
        msg["params"] = params
    if not notificacion:
        siguiente_id += 1
        msg["id"] = siguiente_id
    print(f"\n>>> {json.dumps(msg, ensure_ascii=False)}")
    proc.stdin.write(json.dumps(msg) + "\n")
    proc.stdin.flush()
    if notificacion:
        return None
    linea = proc.stdout.readline()          # una respuesta = una linea JSON en stdout
    try:
        resp = json.loads(linea)
    except json.JSONDecodeError:
        print(f"<<< !! linea que NO es JSON-RPC: {linea!r}")
        return None
    print(f"<<< {json.dumps(resp, ensure_ascii=False, indent=2)}")
    return resp


enviar("initialize", {"protocolVersion": "2025-06-18", "capabilities": {},
                      "clientInfo": {"name": "cliente-a-pelo", "version": "1.0"}})
enviar("notifications/initialized", notificacion=True)
i = 0
while i < len(ordenes):
    orden = ordenes[i]
    if orden == "list":
        enviar("tools/list")
    elif orden == "resources":
        enviar("resources/list")
    elif orden == "read":
        enviar("resources/read", {"uri": ordenes[i + 1]}); i += 1
    elif orden == "call":
        enviar("tools/call", {"name": ordenes[i + 1], "arguments": json.loads(ordenes[i + 2])}); i += 2
    i += 1

proc.stdin.close()
proc.wait(timeout=10)
print("\n--- stderr del servidor (logging) ---")
print(proc.stderr.read().strip())
