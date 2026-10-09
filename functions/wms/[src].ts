// Cloudflare Pages: /wms/nmd och /wms/sgu (se server/wms.ts)
import { cached, type PagesContext } from '../../server/cache'
import { ALLOWED, wms } from '../../server/wms'

export const onRequestGet = (ctx: PagesContext) => cached(ctx, wms, ALLOWED)
