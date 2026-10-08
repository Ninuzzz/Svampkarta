# Mycel – överlämning (2026-10-08)

Läs den här filen först i en ny session. Den beskriver läget, hur allt hänger ihop och vad som återstår.

## Vad det är

**Mycel** är en svensk svamp- och bärkarta: React 19, Vite 8, TypeScript, Tailwind v4, Leaflet.
Den räknar fram var chansen är störst att hitta 7 svampar och 6 bär, utifrån skog, jordart, terräng, skogsålder, stigar och väder.
Användarna kan spara egna platser, dagbok och rutter.

- **Live:** https://mycel-svampkarta.netlify.app (Netlify, manuell deploy, se nedan)
- **Kod:** https://github.com/Ninuzzz/Svampkarta (gren `main`)
- **Hemkommun:** Landskrona (`src/lib/home.ts`, kommunkod 1282)
- **Språk i UI och kodkommentarer:** svenska. Användaren vill ha korta, handlingsinriktade svar på svenska.

## Publicera

```bash
npm run build
npx -y netlify-cli@latest deploy --prod --no-build --dir dist
```

- Netlify-funktionerna i `netlify/functions/` följer med automatiskt.
- Netlify tömmer CDN-cachen vid varje deploy. Första kartladdningen efter en deploy tar cirka 13 s, därefter cirka 6 s.
- Git: commit med `-c user.name=Ninuzzz -c user.email=linus4091@gmail.com`, push till `origin main`.

## Arkitektur i korthet

**Analys (`src/analysis/worker.ts`, körs i en pool med upp till 4 Web Workers via `client.ts`)**

- Chanskartan räknas alltid på zoom 13 (≈10 m/pixel). Andra zoomnivåer skalar samma rutor. Inställningen finns i `CHANCE_NATIVE_ZOOM` i `src/map/ChanceLayer.ts`.
- Kartan analyserar bara valda kommuner (`AreaPicker`, `public/kommuner/*.json`, byggs med `scripts/kommuner/build.mjs`).
- Modellformeln finns i `src/analysis/model.ts`. Den är multiplikativ: habitat × jord × terräng × kanter × ålder × stig, och delas med träningen.
- Artmodellerna ligger i `species.ts`. Tränade vikter finns i `trained.ts`, som genereras.

**Datakällor (alla gratis)**

| Data | Källa och väg |
|---|---|
| Marktäcke | NMD 2023 (Naturvårdsverket WMS) |
| Jordarter | SGU (WMS) |
| Höjd | Terrarium DEM (AWS) |
| Skogsålder | SLU 2025, BigTIFF via range-anrop |
| Stigar | OpenFreeMap-vektorrutor |
| Väder | Open-Meteo |

- NMD och SGU går via `netlify/functions/wms.mts`, en delad CDN-cache som bara godtar exakta rutnätsblock. Om cachen inte svarat inom 2,5 s hämtar workern direkt från källan.
- SLU-åldern går via `netlify/functions/age.mts`, med fasta byte-spann på högst 1 MB.
- Den öppna `/slu-age`-proxyn är **borttagen** i produktion. Den finns bara i Vite-dev (`vite.config.ts`).

**Offline / PWA**

- Service workern är `src/sw.js`. Den kopieras till `dist/sw.js` med en filista som ett plugin i `vite.config.ts` fyller i.
- Knappen "Spara området för offline" finns i områdeskortet.
- Bakgrundskartan laddas medvetet inte ner i förväg, eftersom Esri och OSM förbjuder det i sina villkor.

**Synk (frivillig, Supabase)**

- Projektet är `ltbvswyfmuyzprvsngvh`. Den publika nyckeln ligger i `.env`.
- `src/lib/changes.ts` spårar ändringar och laddas alltid.
- `src/lib/sync.ts` laddas bara för inloggade. Den gör pull, sedan en synkron merge (senaste ändringen vinner per sak), sedan push.
- Foton ligger i bucketen `photos`.
- Inloggningen sker inline i `src/components/SyncPanel.tsx` (kortet "Din data stannar hos dig" på startsidan), utan popup.
- Kontoägare per enhet: `mycel:sync-owner`. Byter ett annat konto sparas den gamla datan i `mycel:backup:<uid>`.
- Schema: `supabase/schema.sql` och `supabase/hardening.sql`. E-postmallar: `supabase/email/`.

**Säkerhet**

- CSP och X-Frame-Options sätts i `public/_headers`.
- Lägger du till en ny extern källa måste den in i CSP:n, annars blockeras den.

## Träning (`scripts/train/`)

1. `fetch-gbif.mjs` och `fetch-more.mjs` skriver `data/occurrences.json`. Datan finns också i en variant med svampkarta.se-fynd, märkta `src: 'svampkarta'`.
2. `extract.mjs` läser in egenskaper för punkterna. Starta först en träningsserver: `npx vite --config scripts/train/vite.train.config.ts --port 5175`, och kör sedan `node scripts/train/extract.mjs http://localhost:5175`.
3. `node scripts/train/fit.ts` kör 5-faldig geografisk korsvalidering och testar alltid mot GBIF-fynd. Den jämför varianten med bara GBIF mot varianten med svampkarta-fynden.
4. Resultatet skrivs till `src/analysis/trained.ts`.

- `data/` ligger i `.gitignore`, eftersom den är stor.
- Viktigt: ordningen i `TREE_KEYS` i `model.ts` får aldrig ändras, eftersom index sparas i träningsdatan. Nya typer läggs sist (senast: `oppen` = NMD 41, öppen naturmark).

**Resultat (korsvaliderat):** 47 % av fynden hamnar i den bästa femtedelen av marken, mot 34 % före träning och 20 % för "närmaste skog".

- Svampar: kantarell och trattkantarell använder även svampkarta.se-fynd.
- Bär efter större urval och klassen `oppen`:

| Bär | Före | Efter |
|---|---|---|
| Blåbär | 9 % | 37 % |
| Hallon | 16 % | 54 % |
| Smultron | 46 % | 59 % |

- Sist lades en spärr till: öppen mark räknas bara i skogsbygd (`tw *= forest²` i `model.ts`), så att betesmark bland åkrar inte markeras. Hallon och smultron tappade då cirka 5 procentenheter, mätt utan korsvalidering.

## Status hos användaren (Supabase)

Gjort:
- `schema.sql` är körd.
- Site URL och Redirect URLs är inställda.
- Google-inloggning är påslagen.
- Egen SMTP via Gmail med applösenord.
- `hardening.sql` är körd (bekräftat 2026-10-08).
- E-postmallarna från `supabase/email/` är inlagda (bekräftat 2026-10-08).

- Google-appen är publicerad (In production, 2026-10-08). Branding har startsida och länk till `public/integritet.html`.

Oklart eller kvar:
- **Synken är inte testad med ett riktigt konto.** Den är verifierad med typkontroll, granskning och genomläsning. Be användaren testa på två enheter.

## Kända begränsningar och idéer

- Blåbär och lingon är fortfarande svagast mot slumpvisa markpunkter.
- Lager med riktiga fynd (GBIF/svampkarta-prickar på kartan) har föreslagits men inte gjorts.
- Användaren rapporterade att åkermark markerades. Det kunde inte återskapas för svampar. Spärren ovan är den troliga lösningen för bär. **Be användaren bekräfta** och fråga vilken art och plats det gällde.
- Puppeteer-test på Windows: använd korta `--user-data-dir`-sökvägar, till exempel `C:/Users/linus/AppData/Local/Temp/xx123`. Långa sökvägar spräcker Windows gräns på 260 tecken, och då ger Cache Storage felet "Entry already exists".
- Rör inte användarens egen dev-server på port 5173.
