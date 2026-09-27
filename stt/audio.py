"""Voz -> texto con Whisper en local (gratis, sin API key). Reutiliza el audio.py de AI Engineer S7.

Whisper se entreno con audio mono a 16 kHz: todo lo que entra (m4a de la Grabadora, webm del navegador,
wav a 48 kHz...) se convierte primero a ese formato con ffmpeg.
"""
import os
import shutil
import subprocess
import time

import numpy as np

MODELO_WHISPER = os.environ.get("WHISPER_MODELO", "small")   # "small" es el minimo fiable en espanol (S7)
FRECUENCIA = 16000
_modelos = {}


def ruta_ffmpeg() -> str:
    """ffmpeg del sistema, o el que trae el paquete imageio-ffmpeg (pip install imageio-ffmpeg), o FFMPEG=..."""
    if os.environ.get("FFMPEG"):
        return os.environ["FFMPEG"]
    if shutil.which("ffmpeg"):
        return "ffmpeg"
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def a_16k_mono(datos: bytes) -> np.ndarray:
    """Cualquier formato de audio (bytes) -> array float32, mono, 16 kHz. Es lo que Whisper espera."""
    cmd = [ruta_ffmpeg(), "-v", "error", "-i", "pipe:0",
           "-ac", "1",                 # 1 canal (mono)
           "-ar", str(FRECUENCIA),     # 16 000 muestras por segundo
           "-f", "f32le", "pipe:1"]    # float32 crudo por la salida estandar
    salida = subprocess.run(cmd, input=datos, capture_output=True, check=True).stdout
    return np.frombuffer(salida, dtype=np.float32).copy()   # copy(): PyTorch quiere un array escribible


def modelo(nombre: str = MODELO_WHISPER):
    import whisper
    if nombre not in _modelos:
        _modelos[nombre] = whisper.load_model(nombre)   # la primera vez se descarga (~460 MB el small)
    return _modelos[nombre]


def transcribir(datos: bytes, nombre: str = MODELO_WHISPER) -> dict:
    audio = a_16k_mono(datos)
    t0 = time.time()
    r = modelo(nombre).transcribe(audio, language="es", fp16=False)   # fp16=False: estamos en CPU
    return {
        "texto": r["text"].strip(),
        "duracion_audio": round(len(audio) / FRECUENCIA, 1),
        "segundos": round(time.time() - t0, 1),
        "modelo": nombre,
        "segmentos": [(round(s["start"], 1), round(s["end"], 1), s["text"].strip()) for s in r["segments"]],
    }
