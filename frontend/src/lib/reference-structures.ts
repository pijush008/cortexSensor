/**
 * Reference structures shown on the public homepage.
 *
 * WHAT THIS IS: four real Indian civil structures, chosen because they span
 * four different structural typologies and therefore four different monitoring
 * problems. They illustrate the CLASSES of structure this platform is built
 * for.
 *
 * WHAT THIS IS NOT: a client list. Cloudglance is not claimed to monitor any of
 * them, and no sensor reading, sensor count or health state appears here.
 * Naming real infrastructure and attaching invented telemetry to it would be a
 * false statement about an asset that real people are responsible for — worse
 * than an invented number, because it is attributable.
 *
 * Every figure below is a published dimension, verified against the sources
 * recorded in `source`. If a figure cannot be sourced it does not go on the
 * page. `question` is phrased as the engineering question the typology raises,
 * never as a claim about the structure's condition.
 */

export type ViewKind = "elevation" | "section";

export interface ReferenceStructure {
  id: string;
  name: string;
  place: string;
  /** Year the structure opened to traffic/service. */
  year: number;
  typology: string;
  material: string;
  /** The characteristic drawing for this structure type. */
  view: ViewKind;
  /** Published dimensions, rendered as a dimension string under the drawing. */
  dimensions: { label: string; value: string }[];
  /** Horizontal extent drawn, in metres — the basis of the shared scale. */
  spanMetres: number;
  /** Vertical extent drawn, in metres. */
  heightMetres: number;
  /** The monitoring problem this typology poses. A question, not a diagnosis. */
  question: string;
  source: string;
}

/**
 * Ordered tallest first, so the shared-scale comparison reads as a descending
 * skyline rather than an arbitrary sequence.
 */
export const REFERENCE_STRUCTURES: ReferenceStructure[] = [
  {
    id: "chenab",
    name: "Chenab Rail Bridge",
    place: "Reasi, Jammu & Kashmir",
    year: 2025,
    typology: "Steel arch",
    material: "Steel",
    view: "elevation",
    dimensions: [
      { label: "Arch span", value: "467 m" },
      { label: "Above river", value: "359 m" },
      { label: "Total length", value: "1 315 m" },
    ],
    spanMetres: 467,
    heightMetres: 359,
    question:
      "Designed for 260 km/h wind and seismic zone V. How does a 467 m arch's modal response drift as temperature and wind load change through a day?",
    source: "https://en.wikipedia.org/wiki/Chenab_Rail_Bridge",
  },
  {
    id: "bhakra",
    name: "Bhakra Dam",
    place: "Bilaspur, Himachal Pradesh",
    year: 1963,
    typology: "Concrete gravity dam",
    material: "Mass concrete",
    view: "section",
    dimensions: [
      { label: "Height", value: "226 m" },
      { label: "Crest length", value: "520 m" },
      { label: "Base width", value: "191 m" },
    ],
    spanMetres: 191,
    heightMetres: 226,
    question:
      "Uplift, seepage and the slow thermal cycle of mass concrete act over decades. Which trend is seasonal, and which is not?",
    source: "https://en.wikipedia.org/wiki/Bhakra_Dam",
  },
  {
    id: "bandra-worli",
    name: "Bandra–Worli Sea Link",
    place: "Mumbai, Maharashtra",
    year: 2010,
    typology: "Cable-stayed",
    material: "Precast concrete, stay cables",
    view: "elevation",
    dimensions: [
      { label: "Main spans", value: "2 × 250 m" },
      { label: "Pylon height", value: "126 m" },
      { label: "Total length", value: "5.6 km" },
    ],
    spanMetres: 500,
    heightMetres: 126,
    question:
      "Stay force redistributes as the deck moves and cables age. Which changes in tension are traffic, and which are the structure?",
    source: "https://en.wikipedia.org/wiki/Bandra%E2%80%93Worli_Sea_Link",
  },
  {
    id: "howrah",
    name: "Howrah Bridge",
    place: "Kolkata, West Bengal",
    year: 1943,
    typology: "Balanced cantilever truss",
    material: "Riveted steel",
    view: "elevation",
    dimensions: [
      { label: "Main span", value: "457 m" },
      { label: "Total length", value: "705 m" },
      { label: "Tower height", value: "82 m" },
    ],
    spanMetres: 457,
    heightMetres: 82,
    question:
      "Eighty years of riveted steel under dense traffic in a humid delta. Where is fatigue accumulating, and how fast?",
    source: "https://en.wikipedia.org/wiki/Howrah_Bridge",
  },
];

/**
 * Metres per drawing unit, shared by every structure so the four drawings can
 * be compared directly. Set by the tallest structure (Chenab, 359 m) with head
 * room for its dimension string.
 */
export const SHEET_METRES = 400;
