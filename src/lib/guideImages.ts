/** Bilder från Wikimedia Commons (fria licenser), sparade lokalt i public/guide som WebP. Fotograf och licens visas i appen. */
export interface GuideImage {
  src: string
  page: string
  artist: string
  license: string
}

export const IMAGES: Record<string, GuideImage> = {
  kantarell: { src: "/guide/kantarell.webp", page: "https://commons.wikimedia.org/wiki/File:Chanterelle_Cantharellus_cibarius.jpg", artist: "Okänd", license: "CC BY-SA 3.0" },
  trattkantarell: { src: "/guide/trattkantarell.webp", page: "https://commons.wikimedia.org/wiki/File:Craterellus_tubaeformis_1345904803_69350246bb_o.jpg", artist: "Miika Silfverberg from Vantaa, Finland", license: "CC BY-SA 2.0" },
  svarttrumpet: { src: "/guide/svarttrumpet.webp", page: "https://commons.wikimedia.org/wiki/File:Craterellus_cornucopioides_JPG1.jpg", artist: "Jean-Pol GRANDMONT", license: "CC BY 3.0" },
  karljohan: { src: "/guide/karljohan.webp", page: "https://commons.wikimedia.org/wiki/File:Boletus_edulis_IT.jpg", artist: "ReddishClover", license: "CC BY-SA 4.0" },
  taggsvamp: { src: "/guide/taggsvamp.webp", page: "https://commons.wikimedia.org/wiki/File:Hedgehog_fungi2.jpg", artist: "D J Kelly", license: "Public domain" },
  farticka: { src: "/guide/farticka.webp", page: "https://commons.wikimedia.org/wiki/File:Albatrellus-ovinus.jpg", artist: "Bernypisa", license: "CC BY-SA 3.0" },
  smorsopp: { src: "/guide/smorsopp.webp", page: "https://commons.wikimedia.org/wiki/File:Suillus_luteus_475376.jpg", artist: "walt sturgeon (Mycowalt)", license: "CC BY-SA 3.0" },
  blabar: { src: "/guide/blabar.webp", page: "https://commons.wikimedia.org/wiki/File:Vaccinium_myrtillus_-_Bilberry_03.jpg", artist: "Zeynel Cebeci", license: "CC BY-SA 4.0" },
  lingon: { src: "/guide/lingon.webp", page: "https://commons.wikimedia.org/wiki/File:Vaccinium_vitis-idaea_20060824_003.jpg", artist: "Jonas Bergsten", license: "Public domain" },
  hjortron: { src: "/guide/hjortron.webp", page: "https://commons.wikimedia.org/wiki/File:Rubus_chamaemorus,_from_Troms%C3%B8,_August_2020.jpeg", artist: "Moravice", license: "CC BY-SA 4.0" },
  hallon: { src: "/guide/hallon.webp", page: "https://commons.wikimedia.org/wiki/File:Fert%C5%91di_k%C3%A1rmin_m%C3%A1lna.JPG", artist: "Kollányi Gábor", license: "CC BY-SA 3.0" },
  tranbar: { src: "/guide/tranbar.webp", page: "https://commons.wikimedia.org/wiki/File:VacciniumOxycoccos.jpg", artist: "Christian Fischer", license: "CC BY-SA 3.0" },
  smultron: { src: "/guide/smultron.webp", page: "https://commons.wikimedia.org/wiki/File:Fragaria_vesca_(fruit),_Ringerike,_Norway.jpg", artist: "Ssu", license: "CC BY-SA 4.0" },
  narrkantarell: { src: "/guide/narrkantarell.webp", page: "https://commons.wikimedia.org/wiki/File:Hygrophoropsis_aurantiaca_241718.jpg", artist: "walt sturgeon (Mycowalt)", license: "CC BY-SA 3.0" },
  orangespindling: { src: "/guide/orangespindling.webp", page: "https://commons.wikimedia.org/wiki/File:Corellanus.jpg", artist: "The original uploader was Michaelll at English Wikipedia.", license: "CC BY-SA 2.5" },
  toppiggiftspindling: { src: "/guide/toppiggiftspindling.webp", page: "https://commons.wikimedia.org/wiki/File:Cortinarius_rubellus_01.jpg", artist: "Eric Steinert", license: "CC BY-SA 3.0" },
  gyllenetrumpet: { src: "/guide/gyllenetrumpet.webp", page: "https://commons.wikimedia.org/wiki/File:Cantharellus_lutescens.jpg", artist: "Pau Cabot", license: "CC BY-SA 3.0" },
  grakantarell: { src: "/guide/grakantarell.webp", page: "https://commons.wikimedia.org/wiki/File:CantharellusCinereus.JPG", artist: "Archenzo", license: "CC BY 3.0" },
  gallsopp: { src: "/guide/gallsopp.webp", page: "https://commons.wikimedia.org/wiki/File:2006-09-14_Tylopilus_felleus_crop.jpg", artist: "Tylopilus_felleus_060914c.jpg: bernd gliwa derivative work:", license: "CC BY-SA 2.5" },
  djavulssopp: { src: "/guide/djavulssopp.webp", page: "https://commons.wikimedia.org/wiki/File:Boletus_satanas.JPG", artist: "Photo by Archenzo. Northern Apennine Mountains (Appennino pi", license: "CC BY-SA 3.0" },
  rodgultagg: { src: "/guide/rodgultagg.webp", page: "https://commons.wikimedia.org/wiki/File:Hydnum_rufescens_20070927w.JPG", artist: "User:Strobilomyces", license: "CC BY-SA 3.0" },
  grynsopp: { src: "/guide/grynsopp.webp", page: "https://commons.wikimedia.org/wiki/File:K%C3%B6rnchen-R%C3%B6hrling_Suillus_granulatus_1.jpg", artist: "Holger Krisp", license: "CC BY 3.0" },
  odon: { src: "/guide/odon.webp", page: "https://commons.wikimedia.org/wiki/File:Vaccinium_uliginosum_fruit.jpg", artist: "David Gaya", license: "CC BY-SA 2.5" },
  ormbar: { src: "/guide/ormbar.webp", page: "https://commons.wikimedia.org/wiki/File:Paris_quadrifolia_kz18.jpg", artist: "Krzysztof Ziarnek, Kenraiz", license: "CC BY-SA 4.0" },
  krakbar: { src: "/guide/krakbar.webp", page: "https://commons.wikimedia.org/wiki/File:Empetrum_nigrum_by_Maseltov_2.jpg", artist: "Maseltov", license: "CC BY-SA 3.0 de" },
  mjolon: { src: "/guide/mjolon.webp", page: "https://commons.wikimedia.org/wiki/File:Arctostaphylos_uva-ursi_25924.JPG", artist: "Walter Siegmund", license: "CC BY 2.5" },
  tibast: { src: "/guide/tibast.webp", page: "https://commons.wikimedia.org/wiki/File:Daphne_mezereum_Kouvervaara_Kuusamo_29.7.2005.jpg", artist: "Okänd", license: "CC BY-SA 3.0" },
  akerbar: { src: "/guide/akerbar.webp", page: "https://commons.wikimedia.org/wiki/File:Rubus_arcticus.jpg", artist: "Carl Axel Magnus Lindman", license: "Public domain" },
  stenbar: { src: "/guide/stenbar.webp", page: "https://commons.wikimedia.org/wiki/File:Rubus_saxatilis_-_Niitv%C3%A4lja_bog.jpg", artist: "Ivar Leidus", license: "CC BY-SA 4.0" },
  bjornbar: { src: "/guide/bjornbar.webp", page: "https://commons.wikimedia.org/wiki/File:Blackberry_(Rubus_fruticosus).jpg", artist: "Ivar Leidus", license: "CC BY-SA 4.0" },
  rosling: { src: "/guide/rosling.webp", page: "https://commons.wikimedia.org/wiki/File:Andromeda_polifolia_bloom.jpg", artist: "Mnolf", license: "CC BY-SA 3.0" },
  trolldruva: { src: "/guide/trolldruva.webp", page: "https://commons.wikimedia.org/wiki/File:Actaea_spicata_fruit_(01).jpg", artist: "Andrea Moro", license: "CC BY-SA 4.0" },
  vitflugsvamp: { src: "/guide/vitflugsvamp.webp", page: "https://commons.wikimedia.org/wiki/File:Destroying_Angel_02.jpg", artist: "en:User:Ben DeRoy", license: "Public domain" },
  blekfungsvamp: { src: "/guide/blekfungsvamp.webp", page: "https://commons.wikimedia.org/wiki/File:Amanita_phalloides_1.JPG", artist: "Archenzo", license: "CC BY-SA 3.0" },
  rodlilaskapa: { src: "/guide/rodlilaskapa.webp", page: "https://commons.wikimedia.org/wiki/File:Albatrellus_subrubescens.jpg", artist: "Irene Andersson (irenea)", license: "CC BY-SA 3.0" },
}
