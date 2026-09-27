"""Servicio local de transcripcion: POST /transcribir con el audio en el cuerpo -> JSON con el texto.

    python stt/servidor.py          (escucha en http://127.0.0.1:8765)

Carga Whisper UNA vez al arrancar: cargar el modelo tarda segundos, transcribir una frase corta tambien,
y no queremos pagar la carga en cada peticion. Solo escucha en 127.0.0.1: nadie de fuera puede usarlo.
"""
import json
import os
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(__file__))
from audio import MODELO_WHISPER, modelo, transcribir  # noqa: E402

PUERTO = int(os.environ.get("STT_PUERTO", "8765"))
MAX_BYTES = 10 * 1024 * 1024   # 10 MB: una orden de voz son segundos, no minutos


class Manejador(BaseHTTPRequestHandler):
    def _json(self, codigo: int, cuerpo: dict):
        datos = json.dumps(cuerpo, ensure_ascii=False).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(datos)))
        self.end_headers()
        self.wfile.write(datos)

    def do_GET(self):
        if self.path == "/salud":
            return self._json(200, {"ok": True, "modelo": MODELO_WHISPER})
        self._json(404, {"error": "ruta no encontrada"})

    def do_POST(self):
        if self.path != "/transcribir":
            return self._json(404, {"error": "ruta no encontrada"})
        largo = int(self.headers.get("Content-Length", 0))
        if largo == 0:
            return self._json(400, {"error": "no ha llegado audio"})
        if largo > MAX_BYTES:
            return self._json(413, {"error": "audio demasiado grande (max 10 MB)"})
        try:
            r = transcribir(self.rfile.read(largo))
        except Exception as e:  # ffmpeg no entiende el formato, audio corrupto...
            return self._json(422, {"error": f"no se pudo transcribir: {e.__class__.__name__}"})
        print(f"[stt] {r['duracion_audio']} s de audio -> {r['segundos']} s  | {r['texto']}", flush=True)
        self._json(200, r)

    def log_message(self, *args):   # silenciamos el log por defecto de http.server
        pass


if __name__ == "__main__":
    t0 = time.time()
    modelo()
    print(f"[stt] Whisper '{MODELO_WHISPER}' cargado en {time.time() - t0:.1f} s", flush=True)
    print(f"[stt] escuchando en http://127.0.0.1:{PUERTO}  (POST /transcribir, GET /salud)", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PUERTO), Manejador).serve_forever()
