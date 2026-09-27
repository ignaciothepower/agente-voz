"use client";
// Etapas 1 y 5 en el navegador: grabar con el microfono (getUserMedia + MediaRecorder) y contestar con voz
// (SpeechSynthesis). Entre medias, el servidor: /api/transcribir (Whisper) y, desde la S3, /api/agente
// (llama3.1 + validacion + MCP del calendario, con memoria de la conversacion).
// Sesion 4: en produccion Whisper corre AQUI, en el navegador (public/whisper-worker.js), y el agente pide
// confirmacion antes de cambiar nada: botones Si / No ademas de la voz.
import { useEffect, useRef, useState } from "react";

type Estado = "listo" | "grabando" | "procesando";
type Resultado = {
  texto?: string;
  sttSegundos?: number;
  intencion?: { accion: string | null; parametros: Record<string, unknown>; destructiva: boolean; segundos: number; nota?: string; modelo?: string };
  sttDonde?: string;
  confirmacion?: string;
  freno?: string;
  respuesta?: string;
  error?: string;
  kb?: number;
  cortado?: boolean;
  cambios?: { campo: string; antes: unknown; despues: unknown; motivo: string }[];
  llamada?: { tool: string; args: Record<string, unknown> };
  resultado?: { ok: boolean; texto: string; motivo?: string; evento?: { enlace?: string } };
  estrategia?: string;
  log?: { usuario: string; agente: string }[];
};

// Tope de grabacion por si nadie pulsa "parar". Con 15 s cortaba ordenes reales (la frase 12 dura 27 s):
// 30 s y, si cortamos, lo decimos en pantalla en vez de hacerlo en silencio.
const MAX_MS = 30_000;
const MODELO_WHISPER = process.env.NEXT_PUBLIC_WHISPER_MODELO ?? "onnx-community/whisper-base";

// "servidor" (local: Whisper small en Python) o "navegador" (Vercel). ?stt=navegador para probarlo en local
function modoStt(): "servidor" | "navegador" {
  const url = typeof location !== "undefined" ? new URLSearchParams(location.search).get("stt") : null;
  return (url ?? process.env.NEXT_PUBLIC_STT) === "navegador" ? "navegador" : "servidor";
}

// El navegador decodifica el webm/opus y lo remuestrea a 16 kHz mono, lo que espera Whisper (lo que hacia ffmpeg en S1)
async function a16kHz(audio: Blob): Promise<Float32Array> {
  const ctx = new AudioContext({ sampleRate: 16000 });
  try {
    const buf = await ctx.decodeAudioData(await audio.arrayBuffer());
    return buf.getChannelData(0);
  } finally {
    ctx.close();
  }
}

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
  const worker = useRef<Worker | null>(null);
  const [whisper, setWhisper] = useState(""); // estado de la descarga del modelo en el navegador

  // En modo navegador, el modelo se empieza a descargar al abrir la pagina (la primera vez tarda; luego, cache)
  useEffect(() => {
    if (modoStt() !== "navegador") return;
    const w = new Worker("/whisper-worker.js", { type: "module" });
    worker.current = w;
    w.onmessage = ({ data }) => {
      if (data.tipo === "progreso") setWhisper(`Descargando Whisper en el navegador: ${data.mb} de ${data.total_mb} MB`);
      if (data.tipo === "listo") setWhisper(`Whisper listo en el navegador (${data.carga_s} s)`);
      if (data.tipo === "error") setWhisper(`Whisper no ha cargado: ${data.error}`);
    };
    w.postMessage({ tipo: "cargar", modelo: MODELO_WHISPER });
    return () => w.terminate();
  }, []);

  function transcribirAqui(audio: Float32Array): Promise<{ texto: string; segundos: number }> {
    return new Promise((ok, mal) => {
      const w = worker.current!;
      const antes = w.onmessage;
      w.onmessage = (ev) => {
        const d = ev.data;
        if (d.tipo === "progreso" || d.tipo === "listo") return antes?.call(w, ev);
        w.onmessage = antes;
        if (d.tipo === "texto") ok(d);
        else mal(new Error(`Whisper en el navegador: ${d.error}`));
      };
      w.postMessage({ tipo: "transcribir", modelo: MODELO_WHISPER, audio }, [audio.buffer]);
    });
  }

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
      let t: { texto: string; segundos: number; error?: string };
      if (modoStt() === "navegador") {
        setPaso("Transcribiendo con Whisper en tu navegador...");
        t = await transcribirAqui(await a16kHz(audio));
        if (!t.texto) throw new Error("No he oído nada. Habla un poco más cerca del micrófono.");
      } else {
        setPaso("Transcribiendo con Whisper...");
        const form = new FormData();
        form.append("audio", audio, "voz.webm");
        const r1 = await fetch("/api/transcribir", { method: "POST", body: form });
        t = await r1.json();
        if (!r1.ok) throw new Error(t.error);
      }
      const base = { texto: t.texto, sttSegundos: t.segundos, kb, cortado: cortado.current, sttDonde: modoStt() };
      setRes(base); // el texto sale en cuanto llega
      await actuar(base);
    } catch (e) {
      setRes((prev) => ({ ...prev, error: (e as Error).message }));
    } finally {
      setPaso("");
      setEstado("listo");
    }
  }

  async function actuar(base: Resultado) {
    setPaso("Entendiendo y actuando (LLM + MCP)...");
    const r2 = await fetch("/api/agente", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto: base.texto }) });
    const a = await r2.json();
    if (!r2.ok) throw new Error(a.error);
    const turno = a.turno;
    setRes({ ...base, intencion: turno.intencion, cambios: turno.cambios, llamada: turno.llamada, resultado: turno.resultado,
             estrategia: turno.estrategia, respuesta: turno.respuesta, log: a.log, confirmacion: turno.confirmacion, freno: turno.freno });
    hablar(turno.respuesta);
  }

  // Sin microfono (o para probar rapido): la misma frase, escrita. Se salta Whisper y va directa al agente.
  const [escrito, setEscrito] = useState("");
  async function enviarEscrito(ev: React.FormEvent) {
    ev.preventDefault();
    const frase = escrito;
    setEscrito("");
    await decir(frase);
  }
  // Tambien lo usan los botones Si / No de la confirmacion
  async function decir(frase: string) {
    if (!frase.trim() || estado !== "listo") return;
    setEstado("procesando");
    const base = { texto: frase.trim() };
    setRes(base);
    try {
      await actuar(base);
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
          <p className="text-sm text-slate-500">Estado: <span className="font-mono">{estado}</span> · actúo en «Agente de voz (demo)»</p>
          {whisper && <p className="text-xs text-slate-400">{whisper}</p>}
        </div>
      </div>

      <form onSubmit={enviarEscrito} className="mt-4 flex gap-2">
        <input value={escrito} onChange={(ev) => setEscrito(ev.target.value)} disabled={estado !== "listo"}
               placeholder="…o escríbelo: «crea una reunión mañana a las diez»"
               className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none" />
        <button type="submit" disabled={estado !== "listo" || !escrito.trim()}
                className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Enviar</button>
      </form>

      {res.error && <p className="mt-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{res.error}</p>}
      {res.texto && (
        <div className="mt-4 rounded-lg bg-slate-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{res.sttSegundos !== undefined ? `1 · Lo que he entendido (Whisper en el ${res.sttDonde}, ${res.sttSegundos} s, ${res.kb} KB de audio)` : "1 · Lo que has escrito (sin Whisper)"}</p>
          <p className="mt-1 text-lg">&ldquo;{res.texto}&rdquo;</p>
          {res.cortado && <p className="mt-1 text-sm text-amber-700">He dejado de escuchar a los {MAX_MS / 1000} s: si te corté, repítelo más corto.</p>}
        </div>
      )}
      {res.intencion && (
        <div className="mt-3 rounded-lg bg-slate-900 px-4 py-3 text-slate-100">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            2 · La intención ({res.intencion.modelo ?? "LLM"}, {res.intencion.segundos} s){res.intencion.destructiva ? " · destructiva: pedirá confirmación" : ""}
          </p>
          <pre className="mt-1 whitespace-pre-wrap font-mono text-sm">{JSON.stringify({ accion: res.intencion.accion, ...res.intencion.parametros })}</pre>
          {res.cambios?.map((c) => (
            <p key={c.campo} className="mt-1 font-mono text-xs text-amber-300">
              validado · {c.campo}: {JSON.stringify(c.antes)} → {c.despues === undefined ? "(fuera)" : JSON.stringify(c.despues)} · {c.motivo}
            </p>
          ))}
        </div>
      )}
      {(res.llamada || res.estrategia) && (
        <div className={`mt-3 rounded-lg px-4 py-3 ${res.resultado?.ok && res.confirmacion !== "pedida" ? "bg-emerald-50" : "bg-amber-50"}`}>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            3 · {res.confirmacion === "pedida" && res.resultado?.ok ? "Ensayo en el MCP: aún no he tocado nada" : res.resultado?.ok ? "Lo que he hecho en tu calendario (MCP)" : "Antes de actuar, te pregunto"}{res.estrategia ? ` · estrategia: ${res.estrategia}` : ""}
          </p>
          {res.llamada && <p className="mt-1 font-mono text-xs text-slate-600">tools/call {res.llamada.tool} {JSON.stringify(res.llamada.args)}</p>}
          {res.resultado && <p className="mt-1 text-sm text-slate-800">{res.resultado.ok ? "✓" : "…"} {res.resultado.texto}</p>}
        </div>
      )}
      {res.freno && (
        <p className="mt-3 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <span className="font-mono text-xs font-semibold uppercase">freno · {res.freno}</span> · no he tocado el calendario
        </p>
      )}
      {res.respuesta && (
        <div className="mt-3 rounded-lg bg-indigo-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-400">4 · Lo que te contesto (en voz alta){res.confirmacion ? ` · confirmación: ${res.confirmacion}` : ""}</p>
          <p className="mt-1 text-indigo-900">{res.respuesta}</p>
          {res.confirmacion === "pedida" && estado === "listo" && (
            <div className="mt-3 flex gap-2">
              <button onClick={() => decir("Sí")} className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700">Sí, hazlo</button>
              <button onClick={() => decir("No")} className="rounded-lg bg-slate-200 px-5 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-300">No</button>
            </div>
          )}
        </div>
      )}
      {res.log && res.log.length > 1 && (
        <div className="mt-3 rounded-lg border border-slate-200 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">La conversación (memoria corta, 30 min)</p>
          {res.log.map((l, k) => (
            <div key={k} className="mt-1 text-sm">
              <p className="text-slate-500">Tú: &ldquo;{l.usuario}&rdquo;</p>
              <p className="text-indigo-800">Agente: {l.agente}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
