import type { SpeciesId } from './species'

/** Artikoner som SVG-strängar (32×32) – används både i React och i kartmarkörer. */

const stroke = 'stroke="#3a2a10" stroke-opacity=".55" stroke-width="1.2" stroke-linejoin="round"'

const funnel = (cap: string, stem: string) =>
  `<path d="M16 17.5v8.2a2.6 2.6 0 0 1-5.2 0v-6" fill="${stem}" ${stroke}/><path d="M4.5 9.2c1.6-2.6 21.4-2.6 23 0-.4 1.4-1.6 2.3-3.2 3.1-2.6 1.3-5.4 2.9-6.9 5.4-.6 1-1.4 1.6-2.4 1.5-1.4-.1-2.3-1.6-3.2-2.9C10 14 4.2 12 4.5 9.2Z" fill="${cap}" ${stroke}/><path d="M8 10.2c2.6.8 5.2 1.1 8 1.1s5.4-.3 8-1.1" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="1.1" stroke-linecap="round"/>`

const trumpet = (c: string) =>
  `<path d="M9.5 6.5c3.6-1.6 9.4-1.6 13 0-.6 3.6-2.6 7-3.8 10.5l-.7 9a2 2 0 0 1-4 0l-.7-9c-1.2-3.5-3.2-6.9-3.8-10.5Z" fill="${c}" ${stroke}/><ellipse cx="16" cy="6.8" rx="5.4" ry="1.4" fill="#000" fill-opacity=".35"/>`

const bolete = (cap: string, stem: string) =>
  `<path d="M11.2 16h9.6l-.4 9.4a4.4 4.4 0 0 1-8.8 0Z" fill="${stem}" ${stroke}/><path d="M3.6 16.2C3.6 9.6 9 5.4 16 5.4s12.4 4.2 12.4 10.8c0 .9-.7 1.3-1.6 1.3H5.2c-.9 0-1.6-.4-1.6-1.3Z" fill="${cap}" ${stroke}/><path d="M9 10c1.6-1.6 4-2.4 6.4-2.6" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.4" stroke-linecap="round"/>`

const flatcap = (cap: string, stem: string) =>
  `<path d="M13 16h6v9.6a3 3 0 0 1-6 0Z" fill="${stem}" ${stroke}/><path d="M4 14.4c.6-4 6-6.6 12-6.6s11.4 2.6 12 6.6c.2 1.4-1.6 2.4-4 2.6-2.6.2-5.2-.6-8-.4s-5.4.6-8 .4c-2.4-.2-4.2-1.2-4-2.6Z" fill="${cap}" ${stroke}/>`

const berries = (c: string, leaf = '#5b7a1e') =>
  `<path d="M16 9c2-3 5-4.6 8.4-4.4-1 3.4-4 5-8.4 4.4Z" fill="${leaf}"/><circle cx="11" cy="17" r="5.4" fill="${c}" ${stroke}/><circle cx="20.6" cy="15" r="5" fill="${c}" ${stroke}/><circle cx="16.6" cy="23.4" r="5" fill="${c}" ${stroke}/><circle cx="9.4" cy="15.2" r="1.3" fill="#fff" fill-opacity=".55"/><circle cx="19" cy="13.2" r="1.2" fill="#fff" fill-opacity=".55"/><circle cx="15" cy="21.6" r="1.2" fill="#fff" fill-opacity=".55"/>`

const aggregate = (c: string, leaf = '#5b7a1e') => {
  const dots = [
    [16, 12], [12, 15], [20, 15], [16, 17], [12.6, 20], [19.4, 20], [16, 23],
  ]
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.2" fill="${c}" ${stroke}/>`)
    .join('')
  return `<path d="M11 8.5c1.6-2.6 3.4-3.4 5-3.4s3.4.8 5 3.4c-3 .6-7 .6-10 0Z" fill="${leaf}"/>${dots}`
}

const strawberry = (c: string) =>
  `<path d="M16 28c-5-2.6-9-7.6-9-12.4C7 11.6 10 9.4 16 10.4c6-1 9 1.2 9 5.2 0 4.8-4 9.8-9 12.4Z" fill="${c}" ${stroke}/><path d="M10.6 9.2c1.8.2 3.6.8 5.4 2.2 1.8-1.4 3.6-2 5.4-2.2-1.2-1.6-3-2.4-5.4-2.4s-4.2.8-5.4 2.4Z" fill="#5b7a1e"/>${[
    [12, 15], [16, 14.4], [20, 15], [13.6, 19], [18.4, 19], [16, 23],
  ]
    .map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx=".7" ry="1" fill="#ffe08a"/>`)
    .join('')}`

const BODY: Record<SpeciesId, string> = {
  kantarell: funnel('#f2b124', '#f5c75a'),
  trattkantarell: funnel('#7a5d3a', '#e2b13c'),
  svarttrumpet: trumpet('#3b3530'),
  karljohan: bolete('#8b5a2b', '#efe2c4'),
  taggsvamp: flatcap('#e8cf9c', '#f4e7cb'),
  farticka: flatcap('#ddd5c4', '#f1ece0'),
  smorsopp: bolete('#9a6a2e', '#f2dd8d'),
  blabar: berries('#3d5a9e'),
  lingon: berries('#d0283c'),
  hjortron: aggregate('#f0a03a'),
  hallon: aggregate('#d6335c'),
  tranbar: berries('#9e1f33'),
  smultron: strawberry('#e0413a'),
}

export function speciesSvg(id: SpeciesId, size = 32) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}" aria-hidden="true">${BODY[id]}</svg>`
}
