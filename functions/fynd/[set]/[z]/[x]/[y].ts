// Cloudflare Pages: /fynd/<urval>/<z>/<x>/<y> (se server/fynd.ts)
import { cached, type PagesContext } from '../../../../../server/cache'
import { fynd } from '../../../../../server/fynd'

// Nya fynd rapporteras hela tiden: spara en vecka, inte ett år som kartbilderna
const WEEK = 7 * 86400

export const onRequestGet = (ctx: PagesContext) => cached(ctx, fynd, [], WEEK)
