// Cloudflare Pages: /age-range/<fil>/<start>-<slut> (se server/age.ts)
import { cached, type PagesContext } from '../../../server/cache'
import { age } from '../../../server/age'

export const onRequestGet = (ctx: PagesContext) => cached(ctx, age)
