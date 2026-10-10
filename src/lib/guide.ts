import type { SpeciesId } from '../analysis/species'

/**
 * Artguiden. Innehållet är en hjälp för att lära sig känna igen arterna –
 * inte en ersättning för en svampbok eller en kunnig person.
 */

export type Danger = 'dodlig' | 'giftig' | 'oatlig' | 'atlig'
export type Difficulty = 'latt' | 'medel'

export interface LookAlike {
  /** nyckel i IMAGES, om bild finns */
  image?: string
  name: string
  latin: string
  danger: Danger
  diff: string[]
}

export interface GuideEntry {
  id: SpeciesId
  latin: string
  difficulty: Difficulty
  intro: string
  facts: [string, string][]
  signs: string[]
  lookAlikes: LookAlike[]
  tips: string[]
}

export const DANGER_LABEL: Record<Danger, string> = {
  dodlig: 'Dödligt giftig',
  giftig: 'Giftig',
  oatlig: 'Oätlig',
  atlig: 'Ätlig',
}

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  latt: 'Lätt att känna igen',
  medel: 'Kräver noggrannhet',
}

export const GUIDE: GuideEntry[] = [
  {
    id: 'kantarell',
    latin: 'Cantharellus cibarius',
    difficulty: 'latt',
    intro: 'Skogens guld. Äggula, fasta svampar som ofta växer i grupper i mossig skog – men lär dig skilja den från orange spindelskivling.',
    facts: [
      ['Storlek', 'Hatt 3–10 cm'],
      ['Färg', 'Äggul till gulorange'],
      ['Lukt', 'Fruktig, som aprikos'],
      ['Säsong', 'Juli–oktober'],
      ['Växer', 'Mossig barr- och blandskog, gärna vid stigar'],
    ],
    signs: [
      'Åsar – inte skivor: låga, trubbiga, gaffelgrenade veck som löper ner på foten',
      'Hatt och fot har samma äggula färg; hattkanten är vågig och ofta inrullad',
      'Köttet är fast och vitaktigt och går att slita i trådar, som kokt kyckling',
      'Doftar fruktigt, ofta som aprikos',
      'Växer direkt ur marken, aldrig på ved',
    ],
    lookAlikes: [
      {
        image: 'orangespindling',
        name: 'Orange spindelskivling',
        latin: 'Cortinarius orellanus',
        danger: 'dodlig',
        diff: [
          'Har riktiga, rostbruna till orange skivor – inte åsar',
          'Hatten är slät och torr, inte trattformad',
          'Unga exemplar har en spindelvävsliknande slöja under hatten',
          'Giftet skadar njurarna först efter dagar eller veckor',
        ],
      },
      {
        image: 'narrkantarell',
        name: 'Narrkantarell',
        latin: 'Hygrophoropsis aurantiaca',
        danger: 'oatlig',
        diff: [
          'Tunna, täta, äkta skivor som är tydligt orange',
          'Mjukt, segt kött – slits inte i trådar',
          'Växer ofta på multnande ved och barr',
        ],
      },
    ],
    tips: ['Skär av vid foten och borsta rent redan i skogen', 'Torrstek först så att vattnet kokar bort', 'Lämna de minsta – de växer till sig'],
  },
  {
    id: 'trattkantarell',
    latin: 'Craterellus tubaeformis',
    difficulty: 'medel',
    intro: 'Höstens storfynd i fuktig granskog. Lätt att plocka mycket av – och därför viktigt att kontrollera varje exemplar mot toppig giftspindling.',
    facts: [
      ['Storlek', 'Hatt 2–5 cm'],
      ['Färg', 'Gråbrun hatt, gulaktig fot'],
      ['Säsong', 'Augusti–november, tål frost'],
      ['Växer', 'Fuktig, mossig granskog, ofta i stora mattor'],
    ],
    signs: [
      'Hatten är trattformad med ett hål i mitten som fortsätter ner genom foten',
      'Foten är gulaktig, slät och ihålig, ofta tillplattad med en fåra',
      'Undersidan har gråaktiga, grenade åsar – inga skivor',
      'Kommer sent på säsongen, ofta efter rejäla regn',
    ],
    lookAlikes: [
      {
        image: 'toppiggiftspindling',
        name: 'Toppig giftspindling',
        latin: 'Cortinarius rubellus',
        danger: 'dodlig',
        diff: [
          'Den viktigaste förväxlingen – växer i exakt samma miljö',
          'Har glesa, rostbruna, riktiga skivor – inte åsar',
          'Hatten har en liten topp (puckel) och inget hål i mitten',
          'Foten är massiv med gulaktiga sicksackband',
        ],
      },
      {
        image: 'gyllenetrumpet',
        name: 'Gyllene trumpetsvamp',
        latin: 'Craterellus lutescens',
        danger: 'atlig',
        diff: ['Undersidan är gul-orange och nästan slät', 'Växer ofta på kalkrik, fuktig mark'],
      },
    ],
    tips: ['Titta under hatten och genom foten på varje exemplar', 'Plocka aldrig "med räfsa" eller i klump', 'Torkar och fryser utmärkt'],
  },
  {
    id: 'svarttrumpet',
    latin: 'Craterellus cornucopioides',
    difficulty: 'latt',
    intro: 'Svarta trumpeter bland nedfallna löv i ek- och bokskog. Svåra att se men lätta att känna igen.',
    facts: [
      ['Storlek', 'Höjd 4–10 cm'],
      ['Färg', 'Sotsvart till gråsvart'],
      ['Säsong', 'Augusti–oktober'],
      ['Växer', 'Lövskog med ek och bok, lerig och näringsrik mark'],
    ],
    signs: [
      'Hela svampen är en tunn trumpet som är ihålig ända ner till marken',
      'Insidan är sotsvart och fjällig, utsidan grå och nästan slät',
      'Inga skivor och inga tydliga åsar',
      'Hittar du en finns oftast fler – de växer i grupper',
    ],
    lookAlikes: [
      {
        image: 'grakantarell',
        name: 'Grå kantarell',
        latin: 'Cantharellus cinereus',
        danger: 'atlig',
        diff: ['Har tydliga grå åsar på utsidan', 'Trumpeten är grundare'],
      },
    ],
    tips: ['Inga farliga förväxlingar är kända i Sverige – men undvik gamla, blöta exemplar', 'Dela på längden och skölj – barr och insekter gömmer sig i röret', 'Torkar mycket bra'],
  },
  {
    id: 'karljohan',
    latin: 'Boletus edulis',
    difficulty: 'medel',
    intro: 'Svamparnas kung. Stor, kraftig sopp med brun hatt och tjock ljus fot. Lär dig skilja den från den bittra gallsoppen.',
    facts: [
      ['Storlek', 'Hatt 8–25 cm'],
      ['Färg', 'Ljust till mörkt brun hatt, ljus fot'],
      ['Säsong', 'Juli–september'],
      ['Växer', 'Gran, tall och björk, gärna i skogsbryn'],
    ],
    signs: [
      'Under hatten sitter rör (porer), först vita, sedan gula och olivgröna',
      'Foten är tjock och ljus med ett fint vitt nät högst upp',
      'Köttet är vitt och ändrar inte färg när du skär i det',
      'Mild, nötig smak',
    ],
    lookAlikes: [
      {
        image: 'gallsopp',
        name: 'Gallsopp',
        latin: 'Tylopilus felleus',
        danger: 'oatlig',
        diff: [
          'Rören blir rosa när svampen blir äldre',
          'Foten har ett grovt, mörkbrunt nät',
          'Extremt bitter – en enda svamp förstör hela grytan',
          'Test: smaka en liten bit och spotta ut. Bitter = gallsopp',
        ],
      },
      {
        image: 'djavulssopp',
        name: 'Djävulssopp',
        latin: 'Rubroboletus satanas',
        danger: 'giftig',
        diff: ['Röda porer och rödaktig fot', 'Blånar när den skärs', 'Sällsynt, främst i ädellövskog i södra Sverige'],
      },
    ],
    tips: ['Regel för nybörjare: undvik soppar med röda porer', 'Skär itu och kontrollera maskhål', 'Skrapa bort geggiga rör på äldre svampar'],
  },
  {
    id: 'taggsvamp',
    latin: 'Hydnum repandum',
    difficulty: 'latt',
    intro: 'En av de lättaste svamparna för nybörjare – taggar under hatten i stället för skivor.',
    facts: [
      ['Storlek', 'Hatt 4–12 cm'],
      ['Färg', 'Gräddvit till blekt orange'],
      ['Säsong', 'Augusti–oktober'],
      ['Växer', 'Mossig barr- och blandskog, ofta i ringar'],
    ],
    signs: [
      'Små taggar hänger ner under hatten – inga skivor och inga rör',
      'Taggarna lossnar lätt när du drar med fingret',
      'Fast, sprött och ljust kött',
      'Hatten är ofta oregelbunden och foten sitter lite snett',
    ],
    lookAlikes: [
      {
        image: 'rodgultagg',
        name: 'Rödgul taggsvamp',
        latin: 'Hydnum rufescens',
        danger: 'atlig',
        diff: ['Mindre och mer orangeröd', 'Taggarna löper inte ner på foten'],
      },
    ],
    tips: ['Andra taggsvampar har mörka, fjälliga hattar och är beska – inga dödliga förväxlingar', 'Äldre exemplar kan bli beska – skrapa bort taggarna'],
  },
  {
    id: 'farticka',
    latin: 'Albatrellus ovinus',
    difficulty: 'medel',
    intro: 'Vit, kraftig svamp med små porer under, ofta flera sammanvuxna i mager granskog.',
    facts: [
      ['Storlek', 'Hatt 5–15 cm'],
      ['Färg', 'Vit till gråvit, ofta sprucken'],
      ['Säsong', 'Augusti–oktober'],
      ['Växer', 'Mager granskog'],
    ],
    signs: [
      'Mycket små porer (hål) under hatten som löper ner på foten',
      'Hatten är vit till blekgrå och spricker ofta som torr mark',
      'Gulnar svagt när den trycks eller skärs',
      'Kort, kraftig fot – ofta flera svampar ihopvuxna',
    ],
    lookAlikes: [
      {
        image: 'rodlilaskapa',
        name: 'Rodnande fårticka',
        latin: 'Albatrellus subrubescens',
        danger: 'oatlig',
        diff: ['Får laxrosa till orangeröda fläckar', 'Smakar beskt', 'Växer oftare vid tall', 'Kan ge magbesvär'],
      },
    ],
    tips: ['Vänd alltid på svampen – vissa riskor kan se likadana ut uppifrån', 'Bäst som ung', 'Kan ge magbesvär hos vissa – testa en liten mängd först'],
  },
  {
    id: 'smorsopp',
    latin: 'Suillus luteus',
    difficulty: 'latt',
    intro: 'Slemmig, brun sopp med ring på foten som alltid växer nära tall.',
    facts: [
      ['Storlek', 'Hatt 5–12 cm'],
      ['Färg', 'Kastanjebrun, blank'],
      ['Säsong', 'Augusti–oktober'],
      ['Växer', 'Ung tallskog, vägkanter och planteringar på sand'],
    ],
    signs: [
      'Hatten är brun, blank och slemmig i fuktigt väder',
      'Gula rör (porer) under hatten',
      'Tydlig hinnring på foten, vit till lilabrun',
      'Växer alltid nära tall',
    ],
    lookAlikes: [
      {
        image: 'grynsopp',
        name: 'Grynsopp',
        latin: 'Suillus granulatus',
        danger: 'atlig',
        diff: ['Saknar ring på foten', 'Unga exemplar har mjölkvita droppar på porerna'],
      },
    ],
    tips: ['Dra av den slemmiga hatthuden', 'Skrapa bort röret på stora exemplar', 'Ät inte stora mängder – vissa får magbesvär'],
  },
  {
    id: 'champinjon',
    latin: 'Agaricus campestris',
    difficulty: 'medel',
    intro: 'Vit, köttig svamp i gräset på betesmarker och ängar. God matsvamp – men vita flugsvampar är dödliga, så kontrollera alltid skivorna och fotbasen.',
    facts: [
      ['Storlek', 'Hatt 4–10 cm'],
      ['Färg', 'Vit till gräddvit hatt, rosa skivor som blir chokladbruna'],
      ['Säsong', 'Juli–oktober, ofta efter regn'],
      ['Växer', 'I gräs på betesmarker, ängar och gräsmattor – inte i skog'],
    ],
    signs: [
      'Skivorna är rosa hos unga svampar och blir chokladbruna – aldrig vita',
      'Foten har en tunn ring men ingen strumpa (säck) vid basen',
      'Köttet är vitt och rodnar svagt i snitt; det gulnar inte',
      'Luktar milt och gott av svamp',
      'Växer i gräs, ofta i grupper eller ringar',
    ],
    lookAlikes: [
      {
        image: 'vitflugsvamp',
        name: 'Vit flugsvamp',
        latin: 'Amanita virosa',
        danger: 'dodlig',
        diff: ['Skivorna är alltid vita', 'Strumpa (säck) vid fotbasen – gräv upp hela foten', 'Växer i skog, inte ute i gräsmark'],
      },
      {
        image: 'blekfungsvamp',
        name: 'Lömsk flugsvamp',
        latin: 'Amanita phalloides',
        danger: 'dodlig',
        diff: ['Vita skivor och strumpa vid fotbasen', 'Hatten är oftast olivgrön men kan vara nästan vit', 'Växer vid ek och bok i södra Sverige'],
      },
      {
        name: 'Giftchampinjon (karbolchampinjon)',
        latin: 'Agaricus xanthodermus',
        danger: 'giftig',
        diff: ['Gulnar kraftigt i fotbasen när man skär eller gnider', 'Luktar bläck eller karbol, starkast vid tillagning'],
      },
    ],
    tips: [
      'Plocka aldrig vita svampar med vita skivor',
      'Ta upp hela svampen och titta på fotbasen innan du rensar',
      'Lämna helt unga, slutna knappar – skivornas färg syns inte än',
    ],
  },
  {
    id: 'blabar',
    latin: 'Vaccinium myrtillus',
    difficulty: 'latt',
    intro: 'Skogens vanligaste bär. Blåsvarta bär med blått kött på kantigt grönt ris i skuggig granskog.',
    facts: [
      ['Höjd', 'Ris 15–40 cm'],
      ['Bär', 'Blåsvarta, 5–8 mm'],
      ['Säsong', 'Juli–augusti'],
      ['Växer', 'Skuggig granskog på frisk mark'],
    ],
    signs: [
      'Riset är grönt och kantigt; bladen är tunna, fintandade och fälls på hösten',
      'Bären sitter ensamma och har en blådaggig yta',
      'Köttet är blålila och färgar fingrar och tunga',
      'En liten rund "krona" högst upp på bäret',
    ],
    lookAlikes: [
      {
        image: 'ormbar',
        name: 'Ormbär',
        latin: 'Paris quadrifolia',
        danger: 'giftig',
        diff: ['Ett enda glansigt svartblått bär högst upp på en stjälk', 'Fyra stora blad i krans under bäret', 'Växer i fuktig lövskog'],
      },
      {
        image: 'odon',
        name: 'Odon',
        latin: 'Vaccinium uliginosum',
        danger: 'atlig',
        diff: ['Större och mer blågrått bär med VITT kött', 'Blågröna, ovala blad med hel kant', 'Kan ge illamående i stora mängder'],
      },
      {
        image: 'krakbar',
        name: 'Kråkbär',
        latin: 'Empetrum nigrum',
        danger: 'atlig',
        diff: ['Svarta, blanka bär på krypande ris', 'Barrlika, smala blad', 'Ätliga men smaklösa'],
      },
    ],
    tips: ['Rensa genom att låta bären rulla nerför en lutande handduk', 'Bärplockare går fort men river av blad – var varsam med riset'],
  },
  {
    id: 'lingon',
    latin: 'Vaccinium vitis-idaea',
    difficulty: 'latt',
    intro: 'Röda, syrliga bär i klasar på vintergrönt ris i torr tallskog.',
    facts: [
      ['Höjd', 'Ris 10–30 cm'],
      ['Bär', 'Klarröda, glansiga, i klasar'],
      ['Säsong', 'Augusti–oktober'],
      ['Växer', 'Torr tallskog, berghällar och sandmark'],
    ],
    signs: [
      'Vintergröna, blanka, läderartade blad med lätt inrullad kant',
      'Små mörka prickar på bladens undersida',
      'Bären sitter i klasar i toppen av riset',
      'Plocka när bären är helt röda, även på undersidan',
    ],
    lookAlikes: [
      {
        image: 'tibast',
        name: 'Tibast',
        latin: 'Daphne mezereum',
        danger: 'giftig',
        diff: ['En buske upp till 1 m – inte lågt ris', 'Blanka röda bär sitter tätt direkt längs grenarna', 'Mycket giftig – rör inte'],
      },
      {
        image: 'mjolon',
        name: 'Mjölon',
        latin: 'Arctostaphylos uva-ursi',
        danger: 'oatlig',
        diff: ['Krypande ris; bladen saknar prickar men har nätådror', 'Bären är mjöliga och smaklösa'],
      },
    ],
    tips: ['Röda bär på en hög stängel eller buske ska du låta bli', 'Lingon håller länge – rör dem med socker eller sylta'],
  },
  {
    id: 'hjortron',
    latin: 'Rubus chamaemorus',
    difficulty: 'latt',
    intro: 'Myrens guld. Ett gulorange bär per stjälk på öppna myrar, framför allt i norr.',
    facts: [
      ['Höjd', '10–25 cm'],
      ['Bär', 'Ett per stjälk, gulorange när det är moget'],
      ['Säsong', 'Juli–augusti (kort!)'],
      ['Växer', 'Öppna myrar, främst i norra Sverige'],
    ],
    signs: [
      'Ett enda bär per stjälk, uppbyggt av stora "korn"',
      'Rött och hårt när det är omoget – gyllengult och mjukt när det är moget',
      'Njurformade, flikiga blad som liknar små rabarberblad',
      'Växer på öppen myr, ofta i tuvor',
    ],
    lookAlikes: [
      {
        image: 'akerbar',
        name: 'Åkerbär',
        latin: 'Rubus arcticus',
        danger: 'atlig',
        diff: ['Mörkrött, mindre bär', 'Treflikiga blad', 'Växer i fuktiga ängar och skogsbryn'],
      },
      {
        image: 'stenbar',
        name: 'Stenbär',
        latin: 'Rubus saxatilis',
        danger: 'atlig',
        diff: ['Klarröda bär med få, stora korn', 'Växer på revor i skogen'],
      },
    ],
    tips: ['Inga giftiga förväxlingar', 'Omogna röda bär mognar inte efter plockning – vänta tills de är gula och lossnar lätt'],
  },
  {
    id: 'hallon',
    latin: 'Rubus idaeus',
    difficulty: 'latt',
    intro: 'Söta röda bär på taggiga buskar på hyggen och i skogsbryn.',
    facts: [
      ['Höjd', 'Buske 1–2 m'],
      ['Bär', 'Röda, sammansatta'],
      ['Säsong', 'Juli–augusti'],
      ['Växer', 'Hyggen, skogsbryn och ungskog'],
    ],
    signs: [
      'Bäret är byggt av små kulor och blir ihåligt när det lossnar från fästet',
      'Taggiga, upprätta skott',
      'Bladen har 3–5 småblad och är vitfiltiga på undersidan',
      'Typisk hallondoft',
    ],
    lookAlikes: [
      {
        image: 'trolldruva',
        name: 'Trolldruva',
        latin: 'Actaea spicata',
        danger: 'giftig',
        diff: ['Blanka svarta bär i en klase på en stängel', 'Inga taggar', 'Växer i skuggig lövskog'],
      },
      {
        image: 'tibast',
        name: 'Tibast',
        latin: 'Daphne mezereum',
        danger: 'giftig',
        diff: ['Röda bär sitter direkt längs grenarna', 'Bären är släta och blanka – inte sammansatta'],
      },
      {
        image: 'bjornbar',
        name: 'Björnbär',
        latin: 'Rubus fruticosus',
        danger: 'atlig',
        diff: ['Svarta när de är mogna', 'Fästet följer med in i bäret', 'Kraftigare taggar'],
      },
    ],
    tips: ['Lägg bären i saltvatten en stund så kryper små larver ut'],
  },
  {
    id: 'tranbar',
    latin: 'Vaccinium oxycoccos',
    difficulty: 'medel',
    intro: 'Syrliga röda bär på trådtunna stjälkar som kryper över vitmossan på myrar.',
    facts: [
      ['Växtsätt', 'Krypande ris på vitmossa'],
      ['Bär', 'Röda till rödprickiga, 6–12 mm'],
      ['Säsong', 'September–oktober, gärna efter frost'],
      ['Växer', 'Mossar och myrar'],
    ],
    signs: [
      'Trådtunna stjälkar kryper över vitmossan',
      'Små spetsiga blad som är vitaktiga på undersidan',
      'Bären är stora jämfört med riset och sitter på långa tunna skaft',
      'Mycket syrliga – blir sötare efter frost',
    ],
    lookAlikes: [
      {
        image: 'rosling',
        name: 'Rosling',
        latin: 'Andromeda polifolia',
        danger: 'giftig',
        diff: ['Växer på samma mossar', 'Smala blad med inrullad kant och rosa klockblommor', 'Har inga röda bär – plocka bär, aldrig blad'],
      },
    ],
    tips: ['Lingon växer på upprätt ris i klasar – inte på mossa', 'Kan plockas sent på hösten och även på våren efter snösmältningen'],
  },
  {
    id: 'smultron',
    latin: 'Fragaria vesca',
    difficulty: 'latt',
    intro: 'Små, doftande röda bär i soliga gläntor och vägkanter.',
    facts: [
      ['Höjd', '5–20 cm'],
      ['Bär', 'Små och röda, fröna sitter utanpå'],
      ['Säsong', 'Juni–juli'],
      ['Växer', 'Soliga gläntor, hyggen, vägkanter och sydsluttningar'],
    ],
    signs: ['Treflikiga blad med sågad kant, ofta lite håriga', 'Små röda bär med fröna utanpå', 'Revor (utlöpare) längs marken', 'Stark, söt smultrondoft'],
    lookAlikes: [
      {
        name: 'Smultronfingerört',
        latin: 'Potentilla sterilis',
        danger: 'oatlig',
        diff: ['Nästan likadana blad men blir aldrig några röda bär'],
      },
    ],
    tips: ['Inga giftiga förväxlingar så länge bäret ser ut som en liten jordgubbe med frön utanpå', 'Trä upp på ett grässtrå'],
  },
]

/** De farligaste svamparna i Sverige – lär dig dessa först. */
export const DEADLY: LookAlike[] = [
  {
    image: 'vitflugsvamp',
    name: 'Vit flugsvamp',
    latin: 'Amanita virosa',
    danger: 'dodlig',
    diff: ['Helt vit med vita skivor', 'Ring på foten och en "strumpa" (säck) vid basen – gräv upp hela foten'],
  },
  {
    image: 'blekfungsvamp',
    name: 'Lömsk flugsvamp',
    latin: 'Amanita phalloides',
    danger: 'dodlig',
    diff: ['Grönaktig till olivgul hatt, vita skivor', 'Ring på foten och strumpa vid basen', 'Främst i ädellövskog i södra Sverige'],
  },
  {
    image: 'orangespindling',
    name: 'Orange spindelskivling',
    latin: 'Cortinarius orellanus',
    danger: 'dodlig',
    diff: ['Orange till rödbrun med rostbruna skivor', 'Kan förväxlas med kantarell'],
  },
  {
    image: 'toppiggiftspindling',
    name: 'Toppig giftspindling',
    latin: 'Cortinarius rubellus',
    danger: 'dodlig',
    diff: ['Brun-orange, toppig hatt med rostbruna skivor', 'Kan förväxlas med trattkantarell'],
  },
]

export const SAFETY_RULES = [
  'Ät aldrig något du inte är 100 % säker på',
  'Kontrollera varje exemplar – inte bara det första',
  'Plocka inte svampar med vita skivor, ring och strumpa vid foten',
  'Plocka bär, aldrig blad eller okända bär på buskar',
  'Spara en rå svamp om du blir osäker efteråt – den hjälper vården',
]

export const guideFor = (id: SpeciesId) => GUIDE.find((g) => g.id === id)!
