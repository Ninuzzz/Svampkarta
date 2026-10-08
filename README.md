# Mycel

Mycel är en privat svamp- och bärkarta. En algoritm visar var chansen är störst att hitta svamp och bär, och du sparar dina egna guldställen. Appen är helt gratis: ingen inloggning, inga API-nycklar och ingen server. Den utgår från Landskrona (ändra i `src/lib/home.ts`).

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # statiska filer i dist/
```

## Algoritmen

Analysen körs i en Web Worker (`src/analysis/worker.ts`). Kartan räknas per 256-pixelsruta (cirka 5–20 m per pixel) med en marginal runt varje ruta, så att grannskapsberäkningar fungerar över rutkanterna.

| Faktor | Källa | Vad som räknas |
| --- | --- | --- |
| Skogstyp | NMD 2023, Naturvårdsverket | Trädslag, fastmark/våtmark, hyggen och myr |
| Jordart | SGU Jordarter 1:25 000–1:100 000 | Sand/grus, morän, lera/silt, torv eller berg (avkodat från kartfärgerna) |
| Terräng | Terrain Tiles (AWS Open Data) | Relativ höjd (svacka eller krön), lutning och sydläge |
| Omgivning | NMD | Kanter mot hyggen och öppen mark, närhet till våtmark och vatten, ek och bok i närheten, avdrag för bebyggelse, skogsrik omgivning |
| Skogsålder | SLU skogsålder 2025 (CC BY 4.0) | Ålder på tall- och granskog, 10 m. Läses bitvis via proxyn `/slu-age` |
| Stigar | OpenStreetMap via OpenFreeMap | Närhet till stig och skogsbilväg |
| Sammanhang | Beräknas | Hur stor och sammanhängande den lämpliga skogen är |
| Säsong | Artmodell | Säsongskurva per art, förskjuten efter breddgrad |
| Väder | Open-Meteo | Regn 1–2 veckor bakåt, markfuktighet, temperatur och frost |
| Dina fynd | Dina sparade platser och knapparna "Hittade" och "Hittade inget" | Högre chans nära dina fynd och i liknande skog, lägre där du inte hittat något. Effekten av "Hittade inget" avtar efter några veckor |

Artmodellerna finns i `src/analysis/species.ts`, med vikter som går att justera. Toppar hittas med utjämning och icke-maximum-undertryckning (de svagare topparna nära en starkare plockas bort). Klickar du på kartan visar appen området, och varje faktors bidrag till chansen.

## Träning på riktiga fynd

Vikterna i `src/analysis/species.ts` är expertbedömda. De tränas sedan på öppna fynd från GBIF (bland annat Artportalen) och skrivs till `src/analysis/trained.ts`:

```bash
node scripts/train/fetch-gbif.mjs
npx vite --config scripts/train/vite.train.config.ts --port 5175
node scripts/train/extract.mjs http://localhost:5175
node scripts/train/fit.ts
```

1. **Hämta fynd:** cirka 140 fynd per art plus en bakgrund av alla svamp- respektive ris- och bärfynd. Bakgrunden jämnar ut att fynd oftast rapporteras nära vägar.
2. **Läs av egenskaper:** skog, jordart, terräng och ålder läses av i varje punkt, med samma motor som appen.
3. **Träna:** vikterna justeras för att skilja fyndplatser från bakgrunden, med AUC som mått, och dras mot expertvärdena. Cirka 30 % av fynden hålls utanför, uppdelade i hela geografiska rutor, och används bara för att mäta. Tränade vikter används bara om de är bättre på den testdelen.

## Övrigt

- **Data:** allt sparas lokalt i webbläsaren. Export och import av säkerhetskopia finns på startsidan.
- **Skogsstyrelsens data saknas:** exakt skogsålder och trädhöjd kräver ett kostnadsfritt konto hos Skogsstyrelsen och ingår inte.
