/**
 * Genererad av scripts/train/fit.ts – ändra inte för hand.
 * Vikter tränade på öppna fynd från GBIF (bl.a. Artportalen), 2016–2025, och för vissa arter även svampkarta.se (extra).
 * Testet görs alltid på GBIF-fynd.
 * Alla mått är medel över 5-faldig geografisk korsvalidering (mätt på platser modellen inte tränats på).
 * auc  = sannolikheten att en riktig fyndplats får högre poäng än ett annat svamp-/växtfynd (0,5 = slump, 1 = perfekt).
 * land = samma sak mot slumpade punkter på svensk mark.
 * hit  = andel fynd som hamnar i den bästa femtedelen av marken.
 * Forest = jämförelsemodellen "all skog är lika bra".
 */
import type { SpeciesId, SpeciesModel } from './species.ts'

export interface TrainedInfo {
  used: boolean
  n: number
  /** varav fynd från svampkarta.se */
  extra: number
  /** antal testgrupper och hur många av dem där tränade vikter var bättre */
  folds: number
  better: number
  aucExpert: number
  aucTrained: number
  landExpert: number
  landTrained: number
  landForest: number
  hitExpert: number
  hitTrained: number
  hitForest: number
  params: Partial<Pick<SpeciesModel, 'tree' | 'wet' | 'soil' | 'tpi' | 'south' | 'openEdge' | 'wetEdge' | 'continuity' | 'age'>> | null
}

export const TRAINING_DATE = '2026-10-08'

export const TRAINED: Partial<Record<SpeciesId, TrainedInfo>> = {
  "kantarell": {
    "used": true,
    "n": 1800,
    "extra": 1500,
    "folds": 5,
    "better": 5,
    "aucExpert": 0.431,
    "aucTrained": 0.498,
    "landExpert": 0.578,
    "landTrained": 0.701,
    "landForest": 0.611,
    "hitExpert": 0.153,
    "hitTrained": 0.436,
    "hitForest": 0.25,
    "params": {
      "tree": {
        "tall": 0.196,
        "gran": 1,
        "barrbland": 0.576,
        "lovbarr": 0.668,
        "triv": 0.713,
        "adel": 1,
        "fjall": 0.3,
        "hygge": 0.044
      },
      "wet": {
        "dry": 1,
        "wet": 0.484
      },
      "soil": {
        "sand": 1,
        "moran": 0.6,
        "lera": 0.405,
        "torv": 0.327,
        "berg": 1
      },
      "tpi": 0,
      "south": 0.05,
      "openEdge": 0.22,
      "wetEdge": 0.08,
      "continuity": 0.35,
      "age": [
        12,
        27,
        120,
        200,
        0.9
      ]
    }
  },
  "trattkantarell": {
    "used": true,
    "n": 1800,
    "extra": 1500,
    "folds": 5,
    "better": 5,
    "aucExpert": 0.559,
    "aucTrained": 0.57,
    "landExpert": 0.623,
    "landTrained": 0.78,
    "landForest": 0.713,
    "hitExpert": 0.279,
    "hitTrained": 0.641,
    "hitForest": 0.4,
    "params": {
      "tree": {
        "tall": 0.287,
        "gran": 1,
        "barrbland": 0.726,
        "lovbarr": 0.446,
        "triv": 0.436,
        "adel": 0.774,
        "fjall": 0.198,
        "hygge": 0.02,
        "mire": 0.048
      },
      "wet": {
        "dry": 1,
        "wet": 0.66
      },
      "soil": {
        "sand": 0.784,
        "moran": 0.675,
        "lera": 0.581,
        "torv": 0.679,
        "berg": 1
      },
      "tpi": -0.1,
      "south": 0,
      "openEdge": 0.05,
      "wetEdge": 0.25,
      "continuity": 0.45,
      "age": [
        20,
        72,
        200,
        300,
        1
      ]
    }
  },
  "svarttrumpet": {
    "used": true,
    "n": 300,
    "extra": 0,
    "folds": 5,
    "better": 4,
    "aucExpert": 0.677,
    "aucTrained": 0.69,
    "landExpert": 0.784,
    "landTrained": 0.831,
    "landForest": 0.694,
    "hitExpert": 0.546,
    "hitTrained": 0.688,
    "hitForest": 0.366,
    "params": {
      "tree": {
        "tall": 0.188,
        "gran": 0.432,
        "barrbland": 0.36,
        "lovbarr": 0.368,
        "triv": 0.409,
        "adel": 1
      },
      "wet": {
        "dry": 1,
        "wet": 0.48
      },
      "soil": {
        "sand": 0.581,
        "moran": 0.639,
        "lera": 1,
        "torv": 0.1,
        "berg": 1
      },
      "tpi": 0.1,
      "south": 0.05,
      "openEdge": 0,
      "wetEdge": 0.05,
      "continuity": 0.4
    }
  },
  "karljohan": {
    "used": true,
    "n": 300,
    "extra": 0,
    "folds": 5,
    "better": 5,
    "aucExpert": 0.364,
    "aucTrained": 0.578,
    "landExpert": 0.543,
    "landTrained": 0.697,
    "landForest": 0.551,
    "hitExpert": 0.172,
    "hitTrained": 0.464,
    "hitForest": 0.176,
    "params": {
      "tree": {
        "tall": 0.184,
        "gran": 0.259,
        "barrbland": 0.405,
        "lovbarr": 0.54,
        "triv": 1,
        "adel": 1,
        "fjall": 0.45,
        "hygge": 0.04
      },
      "wet": {
        "dry": 1,
        "wet": 0.35
      },
      "soil": {
        "sand": 1,
        "moran": 0.544,
        "lera": 0.557,
        "torv": 0.149,
        "berg": 0.495
      },
      "tpi": 0,
      "south": 0.05,
      "openEdge": 0.35,
      "wetEdge": 0,
      "continuity": 0,
      "age": [
        8,
        20,
        90,
        150,
        0.7
      ]
    }
  },
  "taggsvamp": {
    "used": true,
    "n": 128,
    "extra": 0,
    "folds": 5,
    "better": 4,
    "aucExpert": 0.442,
    "aucTrained": 0.447,
    "landExpert": 0.611,
    "landTrained": 0.666,
    "landForest": 0.62,
    "hitExpert": 0.28,
    "hitTrained": 0.38,
    "hitForest": 0.281,
    "params": {
      "tree": {
        "tall": 0.214,
        "gran": 0.648,
        "barrbland": 0.456,
        "lovbarr": 0.558,
        "triv": 0.216,
        "adel": 1,
        "hygge": 0.033
      },
      "wet": {
        "dry": 0.54,
        "wet": 1
      },
      "soil": {
        "sand": 1,
        "moran": 0.594,
        "lera": 0.432,
        "torv": 0.387,
        "berg": 1
      },
      "tpi": -0.05,
      "south": 0,
      "openEdge": 0.05,
      "wetEdge": 0.15,
      "continuity": 0.4,
      "age": [
        20,
        50,
        200,
        300,
        1
      ]
    }
  },
  "farticka": {
    "used": false,
    "n": 300,
    "extra": 0,
    "folds": 5,
    "better": 2,
    "aucExpert": 0.638,
    "aucTrained": 0.635,
    "landExpert": 0.8,
    "landTrained": 0.816,
    "landForest": 0.701,
    "hitExpert": 0.643,
    "hitTrained": 0.727,
    "hitForest": 0.391,
    "params": null
  },
  "smorsopp": {
    "used": true,
    "n": 300,
    "extra": 0,
    "folds": 5,
    "better": 5,
    "aucExpert": 0.54,
    "aucTrained": 0.562,
    "landExpert": 0.573,
    "landTrained": 0.656,
    "landForest": 0.531,
    "hitExpert": 0.234,
    "hitTrained": 0.411,
    "hitForest": 0.14,
    "params": {
      "tree": {
        "tall": 1,
        "gran": 0.079,
        "barrbland": 0.44,
        "lovbarr": 0.29,
        "triv": 0.055,
        "adel": 0.115,
        "hygge": 0.074
      },
      "wet": {
        "dry": 1,
        "wet": 0.264
      },
      "soil": {
        "sand": 1,
        "moran": 0.13,
        "lera": 0.297,
        "torv": 0.1,
        "berg": 0.432
      },
      "tpi": 0.15,
      "south": 0.05,
      "openEdge": 0.33,
      "wetEdge": 0,
      "continuity": 0.1,
      "age": [
        4,
        10,
        35,
        70,
        0.45
      ]
    }
  },
  "blabar": {
    "used": false,
    "n": 300,
    "extra": 0,
    "folds": 5,
    "better": 5,
    "aucExpert": 0.616,
    "aucTrained": 0.592,
    "landExpert": 0.431,
    "landTrained": 0.648,
    "landForest": 0.5,
    "hitExpert": 0.099,
    "hitTrained": 0.37,
    "hitForest": 0.144,
    "params": null
  },
  "lingon": {
    "used": true,
    "n": 300,
    "extra": 0,
    "folds": 5,
    "better": 4,
    "aucExpert": 0.601,
    "aucTrained": 0.601,
    "landExpert": 0.459,
    "landTrained": 0.514,
    "landForest": 0.425,
    "hitExpert": 0.183,
    "hitTrained": 0.274,
    "hitForest": 0.114,
    "params": {
      "tree": {
        "tall": 1,
        "gran": 0.267,
        "barrbland": 0.88,
        "lovbarr": 0.371,
        "triv": 0.15,
        "adel": 0.044,
        "fjall": 0.6,
        "hygge": 0.528
      },
      "wet": {
        "dry": 0.72,
        "wet": 0.619
      },
      "soil": {
        "sand": 1,
        "moran": 0.259,
        "lera": 0.203,
        "torv": 0.528,
        "berg": 1
      },
      "tpi": 0.1,
      "south": 0.1,
      "openEdge": 0.13,
      "wetEdge": 0.05,
      "continuity": 0.15,
      "age": [
        12,
        50,
        200,
        300,
        1
      ]
    }
  },
  "hjortron": {
    "used": false,
    "n": 300,
    "extra": 0,
    "folds": 5,
    "better": 5,
    "aucExpert": 0.804,
    "aucTrained": 0.806,
    "landExpert": 0.755,
    "landTrained": 0.757,
    "landForest": 0.417,
    "hitExpert": 0.673,
    "hitTrained": 0.682,
    "hitForest": 0.118,
    "params": null
  },
  "hallon": {
    "used": false,
    "n": 300,
    "extra": 0,
    "folds": 5,
    "better": 5,
    "aucExpert": 0.631,
    "aucTrained": 0.6,
    "landExpert": 0.576,
    "landTrained": 0.716,
    "landForest": 0.432,
    "hitExpert": 0.176,
    "hitTrained": 0.478,
    "hitForest": 0.069,
    "params": null
  },
  "tranbar": {
    "used": false,
    "n": 300,
    "extra": 0,
    "folds": 5,
    "better": 4,
    "aucExpert": 0.842,
    "aucTrained": 0.843,
    "landExpert": 0.801,
    "landTrained": 0.801,
    "landForest": 0.396,
    "hitExpert": 0.722,
    "hitTrained": 0.717,
    "hitForest": 0.067,
    "params": null
  },
  "smultron": {
    "used": true,
    "n": 300,
    "extra": 0,
    "folds": 5,
    "better": 5,
    "aucExpert": 0.589,
    "aucTrained": 0.594,
    "landExpert": 0.587,
    "landTrained": 0.715,
    "landForest": 0.406,
    "hitExpert": 0.242,
    "hitTrained": 0.541,
    "hitForest": 0.068,
    "params": {
      "tree": {
        "hygge": 0.189,
        "adel": 1,
        "triv": 0.432,
        "lovbarr": 0.225,
        "tall": 0.059
      },
      "wet": {
        "dry": 1,
        "wet": 0.18
      },
      "soil": {
        "sand": 0.535,
        "moran": 0.675,
        "lera": 1,
        "torv": 0.1,
        "berg": 0.9
      },
      "tpi": 0.05,
      "south": 0.3,
      "openEdge": 0.45,
      "wetEdge": 0,
      "continuity": 0,
      "age": [
        0,
        0,
        10,
        30,
        0.3
      ]
    }
  }
}
