// La puerta de la version publicada: una clave compartida (APP_CLAVE) antes de dejar hablar con el agente
export default async function Acceso({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto max-w-sm px-6 py-20 font-sans text-slate-800">
      <p className="text-sm font-semibold uppercase tracking-widest text-indigo-600">Agente de voz</p>
      <h1 className="mt-1 text-2xl font-bold">Acceso</h1>
      <p className="mt-2 text-sm text-slate-600">Este agente actúa sobre un calendario real. Escribe la clave para entrar.</p>
      <form method="POST" action="/api/acceso" className="mt-6 flex flex-col gap-3">
        <input name="clave" type="password" required autoFocus placeholder="Clave de acceso"
               className="rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none" />
        <button className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700">Entrar</button>
      </form>
      {error && <p className="mt-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">Clave incorrecta.</p>}
    </main>
  );
}
