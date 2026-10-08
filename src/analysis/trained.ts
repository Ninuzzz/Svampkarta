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
    "aucTrained": 0.499,
    "landExpert": 0.578,
    "landTrained": 0.701,
    "landForest": 0.61,
    "hitExpert": 0.153,
    "hitTrained": 0.44,
    "hitForest": 0.25,
    "params": {
      "tree": {
        "tall": 0.22,
        "gran": 1,
        "barrbland": 0.576,
        "lovbarr": 0.743,
        "triv": 0.792,
        "adel": 1,
        "fjall": 0.3,
        "hygge": 0.04
      },
      "wet": {
        "dry": 1,
        "wet": 0.484
      },
      "soil": {
        "sand": 1,
        "moran": 0.54,
        "lera": 0.405,
        "torv": 0.33,
        "berg": 0.9
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
    "landTrained": 0.779,
    "landForest": 0.713,
    "hitExpert": 0.279,
    "hitTrained": 0.634,
    "hitForest": 0.398,
    "params": {
      "tree": {
        "tall": 0.297,
        "gran": 1,
        "barrbland": 0.726,
        "lovbarr": 0.49,
        "triv": 0.436,
        "adel": 0.774,
        "fjall": 0.198,
        "hygge": 0.022,
        "mire": 0.048
      },
      "wet": {
        "dry": 1,
        "wet": 0.594
      },
      "soil": {
        "sand": 0.784,
        "moran": 0.675,
        "lera": 0.6,
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
    "landForest": 0.693,
    "hitExpert": 0.546,
    "hitTrained": 0.685,
    "hitForest": 0.365,
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
      "south": 0.1,
      "openEdge": 0,
      "wetEdge": 0,
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
    "aucTrained": 0.576,
    "landExpert": 0.544,
    "landTrained": 0.696,
    "landForest": 0.551,
    "hitExpert": 0.172,
    "hitTrained": 0.46,
    "hitForest": 0.175,
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
    "aucTrained": 0.451,
    "landExpert": 0.612,
    "landTrained": 0.676,
    "landForest": 0.62,
    "hitExpert": 0.274,
    "hitTrained": 0.403,
    "hitForest": 0.279,
    "params": {
      "tree": {
        "tall": 0.194,
        "gran": 0.648,
        "barrbland": 0.456,
        "lovbarr": 0.581,
        "triv": 0.216,
        "adel": 1,
        "hygge": 0.033
      },
      "wet": {
        "dry": 0.535,
        "wet": 1
      },
      "soil": {
        "sand": 0.929,
        "moran": 0.54,
        "lera": 0.465,
        "torv": 0.352,
        "berg": 1
      },
      "tpi": -0.05,
      "south": 0,
      "openEdge": 0.05,
      "wetEdge": 0.1,
      "continuity": 0.4,
      "age": [
        20,
        56,
        200,
        300,
        1
      ]
    }
  },
  "farticka": {
    "used": true,
    "n": 300,
    "extra": 0,
    "folds": 5,
    "better": 4,
    "aucExpert": 0.638,
    "aucTrained": 0.636,
    "landExpert": 0.801,
    "landTrained": 0.819,
    "landForest": 0.701,
    "hitExpert": 0.641,
    "hitTrained": 0.733,
    "hitForest": 0.39,
    "params": {
      "tree": {
        "tall": 0.288,
        "gran": 1,
        "barrbland": 1,
        "lovbarr": 0.33,
        "triv": 0.134,
        "adel": 0.09
      },
      "wet": {
        "dry": 1,
        "wet": 0.44
      },
      "soil": {
        "sand": 1,
        "moran": 0.726,
        "lera": 0.45,
        "torv": 0.169,
        "berg": 0.932
      },
      "tpi": 0.1,
      "south": 0.05,
      "openEdge": 0.1,
      "wetEdge": 0,
      "continuity": 0.45,
      "age": [
        30,
        75,
        200,
        300,
        1
      ]
    }
  },
  "smorsopp": {
    "used": true,
    "n": 300,
    "extra": 0,
    "folds": 5,
    "better": 5,
    "aucExpert": 0.54,
    "aucTrained": 0.563,
    "landExpert": 0.576,
    "landTrained": 0.66,
    "landForest": 0.531,
    "hitExpert": 0.251,
    "hitTrained": 0.395,
    "hitForest": 0.14,
    "params": {
      "tree": {
        "tall": 1,
        "gran": 0.087,
        "barrbland": 0.4,
        "lovbarr": 0.29,
        "triv": 0.05,
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
        "lera": 0.27,
        "torv": 0.1,
        "berg": 0.432
      },
      "tpi": 0.15,
      "south": 0.05,
      "openEdge": 0.28,
      "wetEdge": 0,
      "continuity": 0,
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
    "used": true,
    "n": 1500,
    "extra": 0,
    "folds": 5,
    "better": 5,
    "aucExpert": 0.637,
    "aucTrained": 0.631,
    "landExpert": 0.447,
    "landTrained": 0.642,
    "landForest": 0.529,
    "hitExpert": 0.095,
    "hitTrained": 0.37,
    "hitForest": 0.175,
    "params": {
      "tree": {
        "tall": 0.693,
        "gran": 0.815,
        "barrbland": 1,
        "lovbarr": 0.711,
        "triv": 0.79,
        "adel": 0.533,
        "fjall": 0.733,
        "hygge": 0.134,
        "oppen": 0.229
      },
      "wet": {
        "dry": 1,
        "wet": 0.462
      },
      "soil": {
        "sand": 0.729,
        "moran": 0.259,
        "lera": 0.5,
        "torv": 0.432,
        "berg": 1
      },
      "tpi": 0,
      "south": -0.13,
      "openEdge": 0.1,
      "wetEdge": 0.05,
      "continuity": 0.3,
      "age": [
        15,
        80,
        200,
        300,
        1
      ]
    }
  },
  "lingon": {
    "used": true,
    "n": 1500,
    "extra": 0,
    "folds": 5,
    "better": 5,
    "aucExpert": 0.613,
    "aucTrained": 0.627,
    "landExpert": 0.502,
    "landTrained": 0.564,
    "landForest": 0.48,
    "hitExpert": 0.217,
    "hitTrained": 0.356,
    "hitForest": 0.139,
    "params": {
      "tree": {
        "tall": 1,
        "gran": 0.436,
        "barrbland": 0.81,
        "lovbarr": 0.396,
        "triv": 0.22,
        "adel": 0.05,
        "fjall": 0.6,
        "hygge": 0.363,
        "oppen": 0.18
      },
      "wet": {
        "dry": 0.891,
        "wet": 0.495
      },
      "soil": {
        "sand": 0.9,
        "moran": 0.23,
        "lera": 0.25,
        "torv": 0.375,
        "berg": 1
      },
      "tpi": 0.25,
      "south": 0.1,
      "openEdge": 0.13,
      "wetEdge": 0,
      "continuity": 0.25,
      "age": [
        12,
        70,
        200,
        300,
        1
      ]
    }
  },
  "hjortron": {
    "used": false,
    "n": 1499,
    "extra": 0,
    "folds": 5,
    "better": 5,
    "aucExpert": 0.76,
    "aucTrained": 0.764,
    "landExpert": 0.719,
    "landTrained": 0.722,
    "landForest": 0.406,
    "hitExpert": 0.593,
    "hitTrained": 0.608,
    "hitForest": 0.1,
    "params": null
  },
  "hallon": {
    "used": true,
    "n": 1500,
    "extra": 0,
    "folds": 5,
    "better": 5,
    "aucExpert": 0.582,
    "aucTrained": 0.569,
    "landExpert": 0.628,
    "landTrained": 0.745,
    "landForest": 0.405,
    "hitExpert": 0.178,
    "hitTrained": 0.536,
    "hitForest": 0.066,
    "params": {
      "tree": {
        "hygge": 0.396,
        "triv": 1,
        "lovbarr": 0.303,
        "barrbland": 0.147,
        "tall": 0.073,
        "gran": 0.121,
        "adel": 0.688,
        "oppen": 0.44
      },
      "wet": {
        "dry": 1,
        "wet": 0.45
      },
      "soil": {
        "sand": 0.81,
        "moran": 0.288,
        "lera": 1,
        "torv": 0.36,
        "berg": 0.48
      },
      "tpi": 0,
      "south": 0.1,
      "openEdge": 0.4,
      "wetEdge": 0,
      "continuity": 0,
      "age": [
        0,
        0,
        8,
        25,
        0.3
      ]
    }
  },
  "tranbar": {
    "used": false,
    "n": 1500,
    "extra": 0,
    "folds": 5,
    "better": 5,
    "aucExpert": 0.848,
    "aucTrained": 0.85,
    "landExpert": 0.815,
    "landTrained": 0.816,
    "landForest": 0.436,
    "hitExpert": 0.757,
    "hitTrained": 0.758,
    "hitForest": 0.088,
    "params": null
  },
  "smultron": {
    "used": true,
    "n": 1500,
    "extra": 0,
    "folds": 5,
    "better": 5,
    "aucExpert": 0.559,
    "aucTrained": 0.568,
    "landExpert": 0.662,
    "landTrained": 0.765,
    "landForest": 0.44,
    "hitExpert": 0.283,
    "hitTrained": 0.585,
    "hitForest": 0.091,
    "params": {
      "tree": {
        "hygge": 0.268,
        "adel": 1,
        "triv": 0.71,
        "lovbarr": 0.318,
        "tall": 0.148,
        "oppen": 0.556
      },
      "wet": {
        "dry": 1,
        "wet": 0.18
      },
      "soil": {
        "sand": 0.583,
        "moran": 0.317,
        "lera": 1,
        "torv": 0.1,
        "berg": 1
      },
      "tpi": 0.05,
      "south": 0.25,
      "openEdge": 0.45,
      "wetEdge": 0,
      "continuity": 0.1,
      "age": [
        0,
        0,
        10,
        30,
        0.45
      ]
    }
  }
}
