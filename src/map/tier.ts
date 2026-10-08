export type HotspotTier = 'Bäst' | 'Bra' | 'Möjlig'

/**
 * Toppens etikett jämfört med den bästa i vyn. "36 %" ser dåligt ut fast det
 * kan vara det bästa som finns just nu – procenten står kvar i detaljkortet.
 */
export function hotspotTier(score: number, best: number): HotspotTier {
  // liten marginal: 0,36 / 0,4 blir 0,8999… i flyttal men är 90 %
  const r = best > 0 ? score / best + 1e-9 : 0
  return r >= 0.9 ? 'Bäst' : r >= 0.7 ? 'Bra' : 'Möjlig'
}
