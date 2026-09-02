import { redis } from '@/infrastructure/redis';

interface RateLimitConfig {
  limit: number;
  windowSeconds: number;
}

// Predefined rate limiting configurations
export const RATE_LIMIT_PRESETS: Record<string, RateLimitConfig> = {
  standard: { limit: 500, windowSeconds: 60 }, // 500 req/min for general API (increased to avoid dev 429s)
  auth: { limit: 5, windowSeconds: 60 },       // 5 req/min for login, forgot-password
  dgii: { limit: 20, windowSeconds: 60 },      // 20 req/min for DGII submissions
};

// ---------------------------------------------------------------------------
// In-memory fallback for the 'auth' preset only.
// Used when Redis is unavailable to prevent fail-open on authentication
// endpoints (login, forgot-password, register). General API and DGII presets
// keep fail-open to avoid degrading service when Redis is temporarily down.
// ---------------------------------------------------------------------------
interface MemoryBucket {
  count: number;
  resetAt: number; // Unix ms timestamp
}
const memoryStore = new Map<string, MemoryBucket>();

function checkMemoryRateLimit(key: string, preset: keyof typeof RATE_LIMIT_PRESETS): boolean {
  const { limit, windowSeconds } = RATE_LIMIT_PRESETS[preset];
  const now = Date.now();
  const existing = memoryStore.get(key);

  if (!existing || now > existing.resetAt) {
    // Start a new window
    memoryStore.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return true;
  }

  existing.count += 1;

  if (existing.count > limit) {
    console.warn(`[Rate Limit / Memory] Key ${key} exceeded the limit for preset "${preset}" (${existing.count}/${limit})`);
    return false;
  }

  return true;
}

// Periodically purge expired entries to avoid unbounded memory growth
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of memoryStore.entries()) {
      if (now > v.resetAt) memoryStore.delete(k);
    }
  }, 60_000);
}

/**
 * Checks if the request exceeds the rate limit for the given key (e.g. IP or User ID).
 * Returns true if the request is ALLOWED, and false if it is RATE LIMITED.
 *
 * Behavior when Redis is unavailable:
 *   - 'auth' preset  → uses in-memory fallback (fail-closed: still enforces limit)
 *   - other presets  → fail-open (allow) to avoid service degradation
 */
export async function checkRateLimit(
  key: string,
  preset: keyof typeof RATE_LIMIT_PRESETS = 'standard'
): Promise<boolean> {
  const r = redis;
  const redisOffline = !r || r.status !== 'ready';

  if (redisOffline) {
    // Auth endpoints are protected by an in-memory fallback to prevent brute-force
    // attacks even when Redis is down. Other presets degrade gracefully (fail-open).
    if (preset === 'auth') {
      return checkMemoryRateLimit(`mem:${key}`, preset);
    }
    return true;
  }

  const { limit, windowSeconds } = RATE_LIMIT_PRESETS[preset];
  const redisKey = `ratelimit:${preset}:${key}`;

  try {
    // CONTAR Y CADUCAR TIENEN QUE SER LA MISMA OPERACION.
    //
    // Antes eran dos:
    //
    //     const currentCount = await Promise.race([incrPromise, timeoutPromise]);
    //     if (currentCount === 1) {
    //       r.expire(redisKey, windowSeconds).catch(() => {});  // fire and forget
    //     }
    //
    // El `EXPIRE` solo se ponia cuando el contador valia exactamente 1. Si esa
    // PRIMERA peticion tardaba mas de 200 ms, la carrera se resolvia por el
    // timeout y saltaba al `catch` -- pero el `INCR` YA se habia ejecutado en
    // Redis. El codigo nunca veia el 1, asi que el `EXPIRE` no se ponia nunca.
    //
    // A partir de ahi la clave vive SIN CADUCIDAD: el contador sube con cada
    // peticion y, pasado el limite, el endpoint devuelve 429 PARA SIEMPRE.
    // Esperar no sirve, porque no hay ventana que se reinicie. Lo mismo si el
    // proceso se reinicia entre las dos ordenes, o si el propio `expire` falla
    // -- el `.catch(() => {})` se lo tragaba en silencio.
    //
    // Paso de verdad: la lista de facturas quedo bloqueada con 429 de forma
    // permanente y hubo que borrar la clave a mano.
    //
    // Un script Lua se ejecuta entero y sin interrupciones dentro de Redis, asi
    // que el contador NUNCA puede quedarse sin TTL. Ademas es una sola ida y
    // vuelta en vez de dos. Los limites y las ventanas no cambian.
    const LUA_CONTAR_Y_CADUCAR = `
      local c = redis.call('INCR', KEYS[1])
      if c == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
      return c
    `;

    // El timeout sigue: si Redis va lento, no se bloquea la peticion del
    // usuario. La diferencia es que ahora un timeout no puede dejar la clave
    // a medias -- o el script corrio entero, o no corrio.
    const evalPromise = r.eval(LUA_CONTAR_Y_CADUCAR, 1, redisKey, String(windowSeconds));
    const timeoutPromise = new Promise<number>((_, reject) =>
      setTimeout(() => reject(new Error('Redis timeout')), 200)
    );

    const currentCount = Number(await Promise.race([evalPromise, timeoutPromise]));

    if (currentCount > limit) {
      console.warn(`[Rate Limit] Key ${key} exceeded the limit for preset "${preset}" (${currentCount}/${limit})`);
      return false;
    }

    return true;
  } catch (error) {
    // Redis query timed out or threw — fall back to memory for 'auth', fail-open for others
    console.error(`[Rate Limit] Redis error for key ${key} (preset: ${preset}):`, error);
    if (preset === 'auth') {
      return checkMemoryRateLimit(`mem:${key}`, preset);
    }
    return true;
  }
}
