"""Paso 2 de la Sesion 1: transcribir un audio de ejemplo con Whisper local.

    python stt/probar.py audios/01.m4a              transcribe un archivo
    python stt/probar.py audios/01.m4a --formato    ademas ensena el formato antes y despues de convertir
"""
import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(__file__))
from audio import a_16k_mono, ruta_ffmpeg, transcribir  # noqa: E402


def formato_original(ruta: str) -> str:
    """ffmpeg -i sin salida imprime la descripcion del audio (canales, frecuencia, codec)."""
    r = subprocess.run([ruta_ffmpeg(), "-hide_banner", "-i", ruta], capture_output=True, text=True)
    return next((l.strip() for l in r.stderr.splitlines() if "Audio:" in l), "?")


ruta = sys.argv[1]
datos = open(ruta, "rb").read()
if "--formato" in sys.argv:
    audio = a_16k_mono(datos)
    print("ANTES  :", formato_original(ruta))
    print(f"         {len(datos) / 1024:.0f} KB en disco")
    print(f"DESPUES: pcm float32, 16000 Hz, mono, {len(audio)} muestras = {len(audio) / 16000:.1f} s "
          f"({audio.nbytes / 1024:.0f} KB en memoria)")
    print()
r = transcribir(datos)
print(f"Whisper '{r['modelo']}'  |  {r['duracion_audio']} s de audio -> transcrito en {r['segundos']} s (CPU)")
for ini, fin, frase in r["segmentos"]:
    print(f"  [{ini:>4.1f} - {fin:>4.1f} s] {frase}")
print("\nJSON que devolvera el servicio:")
print(json.dumps({k: r[k] for k in ("texto", "duracion_audio", "segundos", "modelo")}, ensure_ascii=False, indent=2))
