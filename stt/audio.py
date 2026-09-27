"""Voz -> texto con Whisper en local (gratis, sin API key). Reutiliza el audio.py de AI Engineer S7.

Whisper se entreno con audio mono a 16 kHz: todo lo que entra (m4a de la Grabadora, webm del navegador,
wav a 48 kHz...) se convierte primero a ese formato con ffmpeg.
"""
import os
import shutil
import subprocess
import tempfile
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
    """Cualquier formato de audio (bytes) -> array float32, mono, 16 kHz. Es lo que Whisper espera.

    Ojo: se lo pasamos a ffmpeg como ARCHIVO, no por stdin. El m4a (MP4) de la Grabadora de Windows guarda su
    indice ("moov") al final del archivo y por una tuberia ffmpeg no puede saltar hasta alli: salia 0 s de audio.
    """
    with tempfile.NamedTemporaryFile(delete=False, suffix=".audio") as tmp:
        tmp.write(datos)
    try:
        cmd = [ruta_ffmpeg(), "-v", "error", "-i", tmp.name,
               "-ac", "1",                 # 1 canal (mono)
               "-ar", str(FRECUENCIA),     # 16 000 muestras por segundo
               "-f", "f32le", "pipe:1"]    # float32 crudo por la salida estandar
        salida = subprocess.run(cmd, capture_output=True, check=True).stdout
    finally:
        os.remove(tmp.name)
    audio = np.frombuffer(salida, dtype=np.float32).copy()   # copy(): PyTorch quiere un array escribible
    if len(audio) == 0:
        raise ValueError("el audio esta vacio o ffmpeg no lo entiende")
    return audio


def modelo(nombre: str = MODELO_WHISPER):
    import whisper
    if nombre not in _modelos:
        _modelos[nombre] = whisper.load_model(nombre)   # la primera vez se descarga (~460 MB el small)
    return _modelos[nombre]


# Vocabulario del dominio: Whisper lo lee como "lo que se dijo antes" y se inclina por estas palabras
VOCABULARIO = ("Agenda de calendario. Reunion, cita con el dentista, a las once, a las diez, mas tarde, "
               "confirmalo, cancela, Laura, marketing, jueves.")


def transcribir(datos: bytes, nombre: str = MODELO_WHISPER, vocabulario: str | None = VOCABULARIO) -> dict:
    audio = a_16k_mono(datos)
    t0 = time.time()
    r = modelo(nombre).transcribe(audio, language="es", fp16=False,   # fp16=False: estamos en CPU
                                  initial_prompt=vocabulario)
    return {
        "texto": r["text"].strip(),
        "duracion_audio": round(len(audio) / FRECUENCIA, 1),
        "segundos": round(time.time() - t0, 1),
        "modelo": nombre,
        "segmentos": [(round(s["start"], 1), round(s["end"], 1), s["text"].strip()) for s in r["segments"]],
    }
