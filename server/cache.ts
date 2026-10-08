/**
 * Cloudflares cache framför en funktion: lyckade svar sparas ett år per
 * datacenter, så källservrarna bara får första anropet. Webbläsaren får
 * funktionens egna cache-huvuden (en vecka).
 */

/** Det Cloudflare Pages skickar till en funktion (bara det vi använder). */
export interface PagesContext {
  request: Request
  waitUntil: (p: Promise<unknown>) => void
}

const YEAR = 31536000

export async function cached(ctx: PagesContext, handler: (req: Request) => Promise<Response>) {
  const cache = (caches as unknown as { default: Cache }).default
  const key = new Request(new URL(ctx.request.url).toString(), { method: 'GET' })
  const hit = await cache.match(key)
  if (hit) return hit

  const res = await handler(ctx.request)
  if (!res.ok) return res
  const body = await res.arrayBuffer()
  const stored = new Response(body, res)
  stored.headers.set('cache-control', `public, max-age=${YEAR}`)
  ctx.waitUntil(cache.put(key, stored))
  return new Response(body, res)
}
