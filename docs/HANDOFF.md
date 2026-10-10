# Mycel – överlämning (2026-10-08)

Läs den här filen först i en ny session. Den beskriver läget, hur allt hänger ihop och vad som återstår.

## Vad det är

**Mycel** är en svensk svamp- och bärkarta: React 19, Vite 8, TypeScript, Tailwind v4, Leaflet.
Den räknar fram var chansen är störst att hitta 8 svampar (ängschampinjon visas bara när den väljs) och 6 bär, utifrån skog, jordart, terräng, skogsålder, stigar och väder.
Användarna kan spara egna platser, dagbok och rutter.

- **Live:** https://mycel-svampkarta.pages.dev (Cloudflare Pages, manuell deploy, se nedan). Flyttad från Netlify 2026-10-08 när Netlifys gratiskrediter tog slut; den gamla adressen mycel-svampkarta.netlify.app visar en äldre version så länge Netlify håller den uppe.
- **Kod:** https://github.com/Ninuzzz/Svampkarta (gren `main`)
- **Hemområde:** väljs av besökaren (se "Hemområde" nedan). Landskrona (kommunkod 1282) är utvecklarens eget och har handinställda startvyer.
- **Språk i UI och kodkommentarer:** svenska. Användaren vill ha korta, handlingsinriktade svar på svenska.

## Publicera

```bash
npm run deploy
```

- Skriptet bygger och kör `wrangler pages deploy` (projekt `mycel-svampkarta`, inställningar i `wrangler.toml`). Wrangler är inloggat med användarens Cloudflare-konto (`npx -y wrangler@4.148.0 login`).
- Funktionerna i `functions/` följer med automatiskt. Själva logiken finns i `server/` (`wms.ts`, `age.ts`), och `server/cache.ts` lägger Cloudflares cache framför dem (ett år per datacenter).
- Cloudflare Pages: `/integritet.html` vidarebefordras till `/integritet`, och `/index.html` till `/`. Därför sparar service workern appen som `/`.
- Gratisplanen tillåter 100 000 funktionsanrop per dag. Når man taket hämtar workern direkt från källan efter 2,5 s.
- Git: commit med `-c user.name=Ninuzzz -c user.email=linus4091@gmail.com`, push till `origin main`.

## Arkitektur i korthet

**Analys (`src/analysis/worker.ts`, körs i en pool med upp till 4 Web Workers via `client.ts`)**

- Chanskartan räknas alltid på zoom 13 (≈10 m/pixel). Inställningen finns i `CHANCE_NATIVE_ZOOM` i `src/map/ChanceLayer.ts`.
- Workern skickar ett *fält* per ruta (täckning, färgvärde, kärna; se `FIELD_SIZE` i `protocol.ts`), inte färdiga pixlar. `ChanceLayer` ritar varje zoomnivå 13–18 från fältet med bilinjär interpolation, så kanterna blir runda och skarpa. Färgskala (lavendel → magenta), kantbredd och genomskinlighet finns i `RAMP` och konstanterna i `ChanceLayer.ts`. Färgerna valdes för att inte förväxlas med raps på flygfotot.
- Utzoomat (< 13) får chanslagret ett sken (`.chance-overview` i `index.css`). Topparna visar chansen i procent (standard sedan 2026-10-08, användarens pappa ville det). Med inställningen "Procent på kartan" avslagen visas i stället Bäst/Bra/Möjlig jämfört med den bästa i vyn (`hotspotTier` i `src/map/tier.ts`). Inställningen sparas som `labelWords` i `mycel:map`.
- Klick på chansfliken markerar det sammanhängande chansområdet (vit kant, `floodArea` i `ChanceLayer.ts`) och kortet visar dess storlek. På skogsfliken visas i stället skogsbeståndet från `inspect` i workern (samma skogstyp, begränsat till en ruta).
- Kartan analyserar bara valda kommuner (`AreaPicker`, `public/kommuner/*.json`, byggs med `scripts/kommuner/build.mjs`).
- Ligger kartans mitt i en kommun som inte är vald visas rutan "<kommun> är inte med än · Lägg till · ×" (`offerKommun` i `MapView.tsx`, kommunen räknas lokalt med `kommunOf` i `src/lib/kommuner.ts`). Förslag från användarens pappa.
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

- NMD och SGU går via `server/wms.ts` (`/wms/:src`), en delad cache som bara godtar exakta rutnätsblock. Om cachen inte svarat inom 2,5 s hämtar workern direkt från källan.
- SLU-åldern går via `server/age.ts` (`/age-range/:file/:range`), med fasta byte-spann på högst 1 MB. Servern försöker igen två gånger vid nätfel, 429 eller serverfel från SLU (`AGE_RETRY_MS`). Går åldern ändå inte att hämta räknas rutan utan ålder, men den är då inte färdig (`complete: false`): workern sparar den inte, och kartlagret frågar en gång till efter 8 s (`AGE_RETRY_MS` i `ChanceLayer.ts`).
- Den öppna `/slu-age`-proxyn är **borttagen** i produktion. Den finns bara i Vite-dev (`vite.config.ts`).

**Offline / PWA**

- Service workern är `src/sw.js`. Den kopieras till `dist/sw.js` med en filista som ett plugin i `vite.config.ts` fyller i.
- Knappen "Spara området för offline" finns i områdeskortet (`src/lib/offline.ts`). Den räknar igenom chanskartans rutor (zoom 13) för de valda kommunerna, så att källdatan hamnar i cachen, och hämtar de rapporterade fynden för området.
- Bakgrundskartan laddas medvetet inte ner i förväg, eftersom Esri och OSM förbjuder det i sina villkor.
- **Enkel karta** (`src/map/SimpleLayer.ts`, tillagd 2026-10-10): ritas i webbläsaren ur det som analysen ändå hämtar – marktäcke (NMD, zoom 13) och vektorrutor från OpenFreeMap (zoom 14: vägar, stigar, vattendrag, ortnamn). Den ligger i en egen kartyta under kartbilderna (z-index 150) och visas när den är vald som bakgrund ("Enkel"), när webbläsaren säger att nätet saknas, eller när en kartbild inte gått att hämta (`baseFailed` i `MapView`: i skogen har telefonen ofta "nät" utan att något laddar). En kartbild som inte laddats är osynlig, så den enkla kartan syns precis där flygfotot saknas. Koden laddas först när den behövs (egen fil, ca 5 kB).
- **Analys av en punkt utan nät**: `inspectPoint` i workern använder zoom 13 (den sparade) när nätet saknas eller zoom 14 inte svarat inom 5 s.
- **Prova offline på riktigt**: sidans offline-läge i Chrome/puppeteer stänger inte av service workerns nät. Gör i stället så här: kör `pages-local`, spara området med en fast webbläsarprofil, stäng servern, och starta webbläsaren igen med samma profil och `--host-resolver-rules=MAP * ~NOTFOUND`. Kontrollerat 2026-10-10: appen startar, den enkla kartan ritas i delar av kommunen som aldrig visats, toppar och fynd syns, och ett tryck på kartan ger områdesbladet.

**Synk (frivillig, Supabase)**

- Projektet är `ltbvswyfmuyzprvsngvh`. Den publika nyckeln ligger i `.env`.
- `src/lib/changes.ts` spårar ändringar och laddas alltid.
- `src/lib/sync.ts` laddas bara för inloggade. Den gör pull, sedan en synkron merge (senaste ändringen vinner per sak), sedan push.
- Foton ligger i bucketen `photos`.
- Inloggningen sker inline i `src/components/SyncPanel.tsx` (kortet "Din data stannar hos dig" på startsidan), utan popup.
- Kontoägare per enhet: `mycel:sync-owner`. Byter ett annat konto sparas den gamla datan i `mycel:backup:<uid>`.
- Schema: `supabase/schema.sql`, `supabase/hardening.sql` och `supabase/delete-account.sql` (funktionen `delete_my_account()` för knappen "Radera konto" i `SyncPanel`; appen tar först bort fotona via Storage). E-postmallar: `supabase/email/`.

**Säkerhet**

- CSP och X-Frame-Options sätts i `public/_headers`.
- Lägger du till en ny extern källa måste den in i CSP:n, annars blockeras den.
- Besöksstatistik: Cloudflare Web Analytics (utan kakor). CSP:n tillåter `static.cloudflareinsights.com` (skript) och `cloudflareinsights.com` (anrop). Slås på i Cloudflare: Workers & Pages → mycel-svampkarta → Metrics → Web Analytics. Beskrivs på integritetssidan.

**Tester**

- `npm test` kör `node --test tests/*.test.ts` (inga extra paket; Node kör TypeScript direkt). `npm run deploy` kör testerna först.
- Testat: synkens sammanslagning (`src/lib/merge.ts`), markeringen av chansområdet (`src/map/flood.ts`) och Bäst/Bra/Möjlig (`src/map/tier.ts`). Modulerna har inga beroenden till webbläsaren; importer mellan dem skrivs med `.ts`-ändelse så att Node hittar dem.

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
- `delete-account.sql` är körd (2026-10-08, kontrollerat: funktionen finns och nekar anonyma anrop).
- E-postmallarna från `supabase/email/` är inlagda (bekräftat 2026-10-08).

- Google-appen är publicerad (In production, 2026-10-08). Branding har startsida och länk till integritetssidan (`public/integritet.html`). Branding pekar på pages.dev (bytt 2026-10-08). Supabase Site URL och Redirect URLs är också bytta till pages.dev (2026-10-08). E-postmallarna i `supabase/email/` har den nya adressen men är inte inklistrade i Supabase igen.

Oklart eller kvar:
- Synken är testad av användaren med ett riktigt Google-konto på två enheter (2026-10-08).

## Hemområde

Appen utgår inte längre från Landskrona (ändrat 2026-10-10). Besökaren väljer själv en kommun, och valet sparas bara i webbläsaren (`mycel:home`).

- **Lagring** (`src/lib/home.ts`): `useHome()` ger `undefined` medan det tas reda på, `null` om inget är valt, annars kommunens id, namn, mittpunkt och utbredning. Den som använde appen tidigare har kommuner sparade i `mycel:map`: den första blir hemområdet utan att någon frågar.
- **Frågan** (`src/components/HomePicker.tsx`): sök bland de 290 kommunerna, eller "Använd min position" – kommunen räknas ut i webbläsaren ur gränserna, positionen skickas inte någonstans. Den visas på startsidan tills ett område är valt (i stället för svampvädret), och går att öppna igen genom att trycka på ortnamnet överst. På kartan visas samma fråga över en Sverigekarta om inget område är valt; lägger man till en kommun på kartan blir den hemområdet.
- **Vad som följer hemområdet**: startsidans väder och "bäst just nu", säsongen i artguiden, kartans första område och startvy, och sökningens prioriterade område (en grov ruta på halva grader, inte kartvyn).
- **Kartans startvy** (`src/lib/homeview.ts`, ren kod med tester): en länk med position går först; annars den senast visade vyn om den är högst 6 timmar gammal (`mycel:view`); annars hemområdet – hela kommunen i bild om det går, men aldrig längre ut än där chansen visas och aldrig närmare än zoom 13, med mitten flyttad åt höger om panelen på bred skärm. Att byta hemområde på startsidan nollställer den senaste vyn.

## Rapporterade fynd (GBIF)

Prickar på chanskartan med fynd som rapporterats öppet (tillagt 2026-10-10). Växeln "Rapporterade fynd" finns under Kartlager och är på som standard (`showFinds` i `mycel:map`).

- **Urval** (`src/lib/fynd.ts`, ren kod med tester): Sverige, position inom 100 m, år 1990 och framåt, licens CC0 eller CC BY. Av varje post behålls bara id, position, år och art (`toFind`). Rapportörens namn och fritext om platsen läses aldrig. Artnycklarna i `TAXA` måste ha samma art-id:n som `EXPERT_MODELS` (ett test kontrollerar det) – lägg till nyckeln när en art läggs till.
- **Server** (`server/fynd.ts`, `/fynd/<urval>/<z>/<x>/<y>`): urval är `svamp`, `bar` eller ett art-id; bara rutor på zoom 10 i Sverige godtas. Bläddrar hos GBIF (300 per sida, högst 3 sidor per ruta; `complete: false` om det finns fler) och försöker igen vid 429 eller serverfel. Cloudflares cache sparar svaret en vecka, webbläsaren ett dygn.
- **Klient** (`src/map/finds.ts`, `src/map/FindsLayer.tsx`): på den publicerade sajten hämtas rutorna via `/fynd`, i utvecklingsläge direkt från GBIF, en ruta i taget (GBIF svarar 429 på många samtidiga anrop). Rutor som inte gick att hämta hämtas igen efter 5 s (två försök) och statusraden säger att något saknas. Statusraden räknar fynden i kartvyn, inte i de hämtade rutorna. På pekskärm har varje prick en osynlig träffyta med radie 16 px.
- **Utseende**: krämvit prick med skogsgrön ring; fynd äldre än tio år ritas svagare. Magenta är reserverat för chansen. Rutan vid tryck ligger uttryckligen i `popupPane` (annars ritas prickar ovanpå den).
- **Att känna till**: fynden är glesa lokalt. Runt Landskrona finns nästan inga svampfynd (6 i hemrutan, alla vid kommunens norra kant); mot Söderåsen finns hundratals. De flesta plockare rapporterar inte, så en tom yta betyder inte att inget växer där. Fynden i träningsdatan (`scripts/train/data/occurrences.json`) är ett slumpurval och används inte av lagret.

## Ändringar efter granskningen 2026-10-10

- **Startvy på mobil**: Landskrona har en fast vy för smal skärm (`TUNED` i `src/lib/homeview.ts`) – ett zoomsteg längre ut och förskjuten inåt land, så att tre toppar syns i stället för en. Automatisk inramning (kommungränsen, eller de bästa topparna) provades och gav sämre eller tomma vyer: gränsen går långt ut i Öresund, och för andra kommuner hamnade zoomen under `chanceMin`.
- **Områdesbladet**: chanskortet står först, före Information. Trycker man på en topp visar bladet toppens art och siffra (`spot` i `AreaSheet`), samma som på kartan; punktens eget värde står på en rad under när det skiljer sig. Toppens siffra är snittet inom ca 35 m (`hotspots()` i `worker.ts`), "Varför?" förklarar punktens värde. Chansstapeln hade en ogiltig CSS-bredd ("54 %" med mellanslag) och var alltid full – lagad.
- **Guiden** öppnas inte längre av sig själv efter 0,9 s (den lade sig över knappen man var på väg mot). Den nås från länken på startsidan och frågetecknet i menyn. `mycel:tour-done` används inte längre.
- **Service workern** (`src/sw.js`): allt i `PRECACHE` tas från cachen (förr bara fyra mappar, så ikonen och manifestet saknades utan nät). `/fynd/` sparas i `mycel-fynd-v1` (nätet först, högst 300 rutor), så prickarna finns kvar utan nät där man redan tittat.
- **Lämnat som det är**: första besöket sparar ca 3,6 MB för offline-bruk, varav 2,2 MB är artguidens bilder. De behålls med flit – bilderna behövs för att känna igen förväxlingsarter utan täckning.
- **Lokal provkörning av den byggda sajten med funktionerna**: `npm run build`, sedan förhandsvisningen `pages-local` i `.claude/launch.json` (wrangler pages dev, port 8790).

## Kända begränsningar och idéer

- **Ängschampinjon (tillagd 2026-10-10)** är den enda arten som växer på öppen mark. Den har `openLand: true` (undantag från spärren "öppen mark bara i skogsbygd" i `score()`, `model.ts`) och `soloOnly: true` (ingår inte i "Alla svampar", i svampväder-indexet eller i gruppens "hittade inget"; se `targetSpecies` i `species.ts`). Vikterna är expertvärden, inte tränade – inga fynd är hämtade för arten. Begränsning: NMD-klassen "Öppen mark" (kod 41, tio teckenfärger hopslagna i `nmdcodes.ts`) rymmer betesmark, strandäng, hed och hällmark, så lagret visar öppen gräsmark i allmänhet; runt Landskrona dominerar strandängarna längs kusten. Bästa marktyp måste ha vikt 1: ett försök att sänka `tree.oppen` till 0,45 dolde nästan alla områden, eftersom visningsgränsen (`SHOW` i `worker.ts`) räknas mot ett tak utan marktypsvikterna. En terrängjustering (`tpi` 0,2) gav ingen synlig effekt och togs bort. Artguiden har foto (`/guide/champinjon.webp`).

- Blåbär och lingon är fortfarande svagast. Orsaken är datan: Artportalens bärfynd ligger mest i södra Sverige, nära bebyggelse och på berg eller sand, medan markpunkterna är slumpade över hela landet (där morän dominerar). Sedan 2026-10-08 viktar `fit.ts` därför markpunkterna för bär efter fyndens regioner (breddgrad × väst/öst). Morän gick då från 0,26 till 0,48 (blåbär) och från 0,23 till 0,43 (lingon). Träffsäkerheten blev ungefär oförändrad: blåbär 32 % och lingon 33 % i bästa femtedelen, mot 22 % och 16 % för "all skog". Samma dag lades 3 000 markpunkter nära bärfynden till (`add-local-random.mjs`, nycklar `rnd-lokal:i`; 2 305 hamnade på mark), så att bären jämförs mot 2 970 punkter i stället för 665. Mätningen blev stabilare men inte bättre: blåbär 31 % och lingon 34 %. Gränsen ligger alltså i vad modellen ser, inte i antalet punkter. Nästa steg vore en ny egenskap som skiljer bra bärskog från dålig, till exempel krontäthet eller trädhöjd (SLU Skogliga grunddata eller Skogsstyrelsens laserdata).
- **Pågår: bättre bärmodell med Skogsstyrelsens data (2026-10-09).** Användaren har beställt ett eget (gratis) användarkonto för Skogsstyrelsens rasterdata; svar kommer per mejl "inom några dagar". Uppgifterna läggs av användaren i `.env.sks.local` (ignoreras av git) som `SKS_USER=` och `SKS_PASS=`. Läs dem aldrig ut i chatten. FTP-inloggningen från produktbeskrivningen fungerar *inte* mot REST (ger 401).
  - Tjänster (ArcGIS ImageServer, Basic-inloggning eller `USER=`/`PASS=` i WMS): `https://geodata.skogsstyrelsen.se/arcgis/rest/services/Publikt/Markfuktighet_SLU_2_0/ImageServer` (band 1 = sannolikhet för blöt mark 0–100, 2 m; band 2 = klass 1 torr-frisk, 2 frisk-fuktig, 3 fuktig-blöt, 4 vatten) och `.../Publikt/SkogligaGrunddata_3_1/ImageServer` (volym, grundyta m²/ha, medelhöjd dm, medeldiameter, biomassa; 10 m; 0 där medelhöjd < 3 m).
  - Plan: proxy i `server/` (som `wms.ts`) med inloggningen som Cloudflare-hemlighet (`npx wrangler pages secret put SKS_USER` resp. `SKS_PASS`, körs av användaren), dev-proxy i `vite.config.ts` som läser `.env.sks.local`, nya fält i `PixelFeatures` (lägg till sist), läs om egenskaper för bär-, bakgrunds- och markpunkter (~16 000 punkter, ~1 h) och träna om med `ONLY=blabar,lingon`.
- Träna om bara vissa arter: `ONLY=blabar,lingon node scripts/train/fit.ts`. Lägg till `OLD=1` för att också mäta de nuvarande vikterna.
- Användaren rapporterade att åkermark markerades. Det kunde inte återskapas för svampar. Spärren ovan är den troliga lösningen för bär. **Be användaren bekräfta** och fråga vilken art och plats det gällde.
- Puppeteer-test på Windows: använd korta `--user-data-dir`-sökvägar, till exempel `C:/Users/linus/AppData/Local/Temp/xx123`. Långa sökvägar spräcker Windows gräns på 260 tecken, och då ger Cache Storage felet "Entry already exists".
- Rör inte användarens egen dev-server på port 5173.
