# Guia de despliegue (Sesion 4)

El microfono del navegador solo funciona en un **contexto seguro**: `https://` o `localhost`. En cuanto el agente sale de tu portatil necesita HTTPS, y Vercel lo da gratis con su subdominio `*.vercel.app`.

## Que cambia entre local y produccion

| Pieza | En local (`npm run dev`) | En Vercel |
|---|---|---|
| Whisper | `stt/` en Python, modelo small, con vocabulario | En el navegador (Transformers.js, `whisper-base`); el audio no sale del movil |
| LLM de intencion | llama3.1 en Ollama | Gemini (capa gratuita de Google AI Studio) |
| MCP del calendario | proceso hijo por stdio | el mismo servidor, conectado en memoria |
| Memoria de la conversacion | cookie firmada | cookie firmada (las funciones no comparten RAM) |
| Login de Google | `/api/google/login` | desactivado: el refresh token ya esta en las variables |
| Puerta | abierta | `APP_CLAVE` |

Todo se elige con variables de entorno: el codigo es el mismo.

## Pasos

1. **Repositorio en GitHub** (publico o privado). Comprueba antes que no se sube nada sensible: `npm run secretos`.
2. **Vercel** -> Add New -> Project -> importar el repositorio. Framework: Next.js (lo detecta solo).
3. **Variables de entorno** (Settings -> Environment Variables), copiadas de tu `.env.local`, mas las de produccion:

   | Variable | Valor |
   |---|---|
   | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | las de tu cliente OAuth |
   | `GOOGLE_REFRESH_TOKEN`, `GOOGLE_CALENDAR_ID` | las que escribio la app en local al conectarse |
   | `LLM` | `gemini` |
   | `GEMINI_API_KEY` | la clave de aistudio.google.com |
   | `NEXT_PUBLIC_STT` | `navegador` |
   | `APP_SECRETO` | 32 caracteres aleatorios o mas (firma de la cookie) |
   | `APP_CLAVE` | la clave que escribiras en `/acceso` |

   Las `NEXT_PUBLIC_*` se incrustan al compilar: si las cambias, vuelve a desplegar.
4. **Deploy**. Cada push a `main` vuelve a desplegar solo, y el CI de GitHub Actions comprueba lo mismo en paralelo.
5. **Probar desde el movil**: abre la URL `https://...vercel.app`, escribe la clave, espera a que Whisper termine de descargarse (una sola vez) y habla.

## Si algo falla

- *"El microfono solo funciona con HTTPS"*: estas entrando por `http://` o por la IP del portatil.
- *401 en /api/agente*: falta la cookie de acceso; entra por `/acceso`.
- *"Falta APP_SECRETO"*: variable ausente o con menos de 32 caracteres.
- *"Gemini: limite de la capa gratuita"*: demasiadas peticiones por minuto; espera.
- *Calendar API 401*: el refresh token ya no vale (se revoco o caduco); conecta de nuevo en local y actualiza la variable.
- Los logs de cada accion (`[registro] {...}`) salen en Vercel -> Project -> Logs.
