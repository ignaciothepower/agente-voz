// Sesion 4: Whisper DENTRO del navegador (Transformers.js + ONNX Runtime en WebAssembly), en un Web Worker para
// no congelar la pagina mientras piensa. En produccion no hay servidor de Python: el audio ni siquiera sale
// del movil, solo viaja el TEXTO. El modelo se descarga una vez de Hugging Face y queda en la cache del navegador.
import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";

env.allowLocalModels = false;
let asr = null;
const descargado = {};

function cargar(modelo) {
  asr ??= pipeline("automatic-speech-recognition", modelo, {
    device: "wasm",
    // el encoder en fp32 (cuantizado pierde mucha calidad en Whisper) y el decoder en q4 (mucho mas ligero)
    dtype: { encoder_model: "fp32", decoder_model_merged: "q4" },
    progress_callback: (p) => {
      if (p.status === "progress" && p.total) {
        descargado[p.file] = [p.loaded, p.total];
        const [l, t] = Object.values(descargado).reduce((a, [x, y]) => [a[0] + x, a[1] + y], [0, 0]);
        self.postMessage({ tipo: "progreso", mb: Math.round(l / 1e6), total_mb: Math.round(t / 1e6) });
      }
    },
  });
  return asr;
}

self.onmessage = async ({ data }) => {
  try {
    const t0 = performance.now();
    const transcribir = await cargar(data.modelo);
    const carga_s = (performance.now() - t0) / 1000;
    if (data.tipo === "cargar") return self.postMessage({ tipo: "listo", carga_s: Math.round(carga_s * 10) / 10 });
    const t1 = performance.now();
    const r = await transcribir(data.audio, { language: "spanish", task: "transcribe" });
    self.postMessage({ tipo: "texto", texto: r.text.trim(), segundos: Math.round((performance.now() - t1) / 100) / 10 });
  } catch (e) {
    self.postMessage({ tipo: "error", error: String(e?.message ?? e) });
  }
};
