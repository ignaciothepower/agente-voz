"use client";
// Etapas 1 y 5 en el navegador: grabar con el microfono (getUserMedia + MediaRecorder) y contestar con voz
// (SpeechSynthesis). Entre medias, el servidor: /api/transcribir (Whisper) y /api/intencion (llama3.1).
import { useRef, useState } from "react";

type Estado = "listo" | "grabando" | "procesando";
type Resultado = {
  texto?: string;
  sttSegundos?: number;
  intencion?: { accion: string | null; parametros: Record<string, unknown>; destructiva: boolean; segundos: number; nota?: string };
  respuesta?: string;
  error?: string;
  kb?: number;
  cortado?: boolean;
};

// Tope de grabacion por si nadie pulsa "parar". Con 15 s cortaba ordenes reales (la frase 12 dura 27 s):
// 30 s y, si cortamos, lo decimos en pantalla en vez de hacerlo en silencio.
const MAX_MS = 30_000;

function hablar(texto: string) {
  if (!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(texto);
  u.lang = "es-ES";
  u.rate = 1.05;
  // Elegir bien la voz: cogiendo "la primera en espanol" salia Elena (es-AR). Preferimos es-ES y, si la hay, LOCAL:
  // las voces "Online (Natural)" de Edge mandan el texto a los servidores de Microsoft para sintetizarlo.
  const voces = speechSynthesis.getVoices();
  const voz = voces.find((v) => v.lang === "es-ES" && v.localService) ?? voces.find((v) => v.lang === "es-ES") ?? voces.find((v) => v.lang.startsWith("es"));
  if (voz) u.voice = voz;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

export default function BotonHablar() {
  const [estado, setEstado] = useState<Estado>("listo");
  const [paso, setPaso] = useState("");
  const [res, setRes] = useState<Resultado>({});
  const grabadora = useRef<MediaRecorder | null>(null);
  const trozos = useRef<Blob[]>([]);
  const corte = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cortado = useRef(false);

  async function empezar() {
    setRes({});
    if (!window.isSecureContext) {
      setRes({ error: "El micrófono solo funciona con HTTPS (o en localhost)." });
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      const nombre = (e as DOMException).name;
      setRes({
        error: nombre === "NotAllowedError"
          ? "Has denegado el permiso del micrófono. Actívalo en el candado de la barra de direcciones y vuelve a probar."
          : nombre === "NotFoundError" ? "No encuentro ningún micrófono conectado." : `No puedo usar el micrófono (${nombre}).`,
      });
      return;
    }
    const tipo = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "";
    const rec = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined);
    trozos.current = [];
    rec.ondataavailable = (ev) => ev.data.size && trozos.current.push(ev.data);
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop()); // apaga el piloto rojo del microfono
      enviar(new Blob(trozos.current, { type: rec.mimeType || "audio/webm" }));
    };
    rec.start();
    grabadora.current = rec;
    cortado.current = false;
    corte.current = setTimeout(() => { cortado.current = true; parar(); }, MAX_MS);
    setEstado("grabando");
  }

  function parar() {
    if (corte.current) clearTimeout(corte.current);
    if (grabadora.current?.state === "recording") grabadora.current.stop();
    setEstado("procesando");
  }

  async function enviar(audio: Blob) {
    const kb = Math.round(audio.size / 1024);
    try {
      setPaso("Transcribiendo con Whisper...");
      const form = new FormData();
      form.append("audio", audio, "voz.webm");
      const r1 = await fetch("/api/transcribir", { method: "POST", body: form });
      const t = await r1.json();
      if (!r1.ok) throw new Error(t.error);
      const base = { texto: t.texto, sttSegundos: t.segundos, kb, cortado: cortado.current };
      setRes(base); // el texto sale en cuanto llega

      setPaso("Entendiendo la intención con llama3.1...");
      const r2 = await fetch("/api/intencion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto: t.texto }) });
      const i = await r2.json();
      if (!r2.ok) throw new Error(i.error);
      setRes({ ...base, intencion: i.intencion, respuesta: i.respuesta });
      hablar(i.respuesta);
    } catch (e) {
      setRes((prev) => ({ ...prev, error: (e as Error).message }));
    } finally {
      setPaso("");
      setEstado("listo");
    }
  }

  const estilos: Record<Estado, string> = {
    listo: "bg-indigo-600 hover:bg-indigo-700",
    grabando: "bg-rose-600 animate-pulse",
    procesando: "bg-slate-400 cursor-wait",
  };
  const etiqueta: Record<Estado, string> = { listo: "Hablar", grabando: "Parar", procesando: "Procesando..." };

  return (
    <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-5">
        <button
          onClick={estado === "listo" ? empezar : estado === "grabando" ? parar : undefined}
          disabled={estado === "procesando"}
          aria-label={etiqueta[estado]}
          className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white shadow-lg transition ${estilos[estado]}`}
        >
          {etiqueta[estado]}
        </button>
        <div>
          <p className="font-semibold">
            {estado === "listo" && "Pulsa y dime qué quieres hacer en tu calendario"}
            {estado === "grabando" && "Te escucho... pulsa Parar cuando termines"}
            {estado === "procesando" && paso}
          </p>
          <p className="text-sm text-slate-500">Estado: <span className="font-mono">{estado}</span> · todavía no toco el calendario</p>
        </div>
      </div>

      {res.error && <p className="mt-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{res.error}</p>}
      {res.texto && (
        <div className="mt-4 rounded-lg bg-slate-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">1 · Lo que he entendido (Whisper, {res.sttSegundos} s, {res.kb} KB de audio)</p>
          <p className="mt-1 text-lg">&ldquo;{res.texto}&rdquo;</p>
          {res.cortado && <p className="mt-1 text-sm text-amber-700">He dejado de escuchar a los {MAX_MS / 1000} s: si te corté, repítelo más corto.</p>}
        </div>
      )}
      {res.intencion && (
        <div className="mt-3 rounded-lg bg-slate-900 px-4 py-3 text-slate-100">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            2 · La intención (llama3.1, {res.intencion.segundos} s){res.intencion.destructiva ? " · destructiva: pedirá confirmación" : ""}
          </p>
          <pre className="mt-1 whitespace-pre-wrap font-mono text-sm">{JSON.stringify({ accion: res.intencion.accion, ...res.intencion.parametros }, null, 2)}</pre>
        </div>
      )}
      {res.respuesta && (
        <div className="mt-3 rounded-lg bg-indigo-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-400">3 · Lo que te contesto (en voz alta)</p>
          <p className="mt-1 text-indigo-900">{res.respuesta}</p>
        </div>
      )}
    </section>
  );
}
