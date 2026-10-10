/**
 * Cloudflares cache framför en funktion: lyckade svar sparas per datacenter
 * (ett år om inget annat anges), så källservrarna bara får första anropet.
 * Webbläsaren får funktionens egna cache-huvuden.
 */

/** Det Cloudflare Pages skickar till en funktion (bara det vi använder). */
export interface PagesContext {
  request: Request
  waitUntil: (p: Promise<unknown>) => void
}

const YEAR = 31536000
/** Funktionens eget cache-huvud, sparat bredvid kopian i cachen. */
const BROWSER_CC = 'x-browser-cache-control'

/**
 * Cachenyckeln byggs bara av sökvägen och de tillåtna parametrarna (i fast
 * ordning). Annars kunde vem som helst lägga till en påhittad parameter, få
 * en ny nyckel varje gång och låta varje anrop gå vidare till källservrarna.
 */
export async function cached(ctx: PagesContext, handler: (req: Request) => Promise<Response>, params: readonly string[] = [], ttl = YEAR) {
  const cache = (caches as unknown as { default: Cache }).default
  const url = new URL(ctx.request.url)
  const q = new URLSearchParams()
  for (const k of [...params].sort()) if (url.searchParams.has(k)) q.set(k, url.searchParams.get(k)!)
  const key = new Request(`${url.origin}${url.pathname}${q.size ? `?${q}` : ''}`, { method: 'GET' })
  const hit = await cache.match(key)
  if (hit) {
    // Kopian i cachen bär cachens livslängd. Webbläsaren ska ha funktionens eget värde,
    // annars sparar den t.ex. fynd en vecka fast funktionen säger ett dygn.
    const own = hit.headers.get(BROWSER_CC)
    if (!own) return hit // sparad före den här ändringen
    const res = new Response(hit.body, hit)
    res.headers.set('cache-control', own)
    res.headers.delete(BROWSER_CC)
    return res
  }

  const res = await handler(ctx.request)
  if (!res.ok) return res
  const body = await res.arrayBuffer()
  const stored = new Response(body, res)
  const own = res.headers.get('cache-control')
  if (own) stored.headers.set(BROWSER_CC, own)
  stored.headers.set('cache-control', `public, max-age=${ttl}`)
  ctx.waitUntil(cache.put(key, stored))
  return new Response(body, res)
}
