"use client";

import { REFERENCE_STRUCTURES, SHEET_METRES } from "@/lib/reference-structures";

/**
 * Four structures on one ground line, at one scale.
 *
 * An earlier version drew each structure in its own box. That shared the scale
 * but not the baseline, so every box carried its own headroom and the reader
 * had to compare four separate frames from memory. Here the comparison is
 * direct and unavoidable: Howrah's 82 m towers stand against Chenab's 359 m
 * deck in the same picture, and the fact that a "long-span bridge" covers both
 * needs no sentence.
 *
 * 1 drawing unit = 1 metre throughout.
 */

const GROUND = SHEET_METRES;
const GAP = 70;
/** Left/right margin. Wide enough for the first structure's height dimension,
 *  which hangs to the LEFT of its footprint and was being clipped at 30. */
const PAD = 100;

/** Drawn footprint per structure, wider than the span where a structure needs
 *  its approaches, valley walls or reservoir to make sense. */
const FOOTPRINT: Record<string, number> = {
  chenab: 560,
  bhakra: 330,
  "bandra-worli": 580,
  howrah: 575,
};

const ORDER = REFERENCE_STRUCTURES.map((s) => s.id);

function offsets(): Record<string, number> {
  let x = PAD;
  const out: Record<string, number> = {};
  for (const id of ORDER) {
    out[id] = x;
    x += FOOTPRINT[id] + GAP;
  }
  return out;
}

const OFFSET = offsets();
const TOTAL_WIDTH =
  ORDER.reduce((sum, id) => sum + FOOTPRINT[id], 0) + GAP * (ORDER.length - 1) + PAD * 2;

/* ── Individual structures, each drawn from its own left edge ─────────────── */

function Chenab(x: number) {
  const span = 467;
  const x0 = x + (FOOTPRINT.chenab - span) / 2;
  const x1 = x0 + span;
  const deckY = GROUND - 359;
  const mid = (x0 + x1) / 2;

  const columns = [];
  for (let i = 1; i < 10; i += 1) {
    const t = i / 10;
    const cx = x0 + span * t;
    const cy = GROUND - 40 - 150 * (1 - Math.pow(2 * t - 1, 2));
    columns.push(<line key={i} x1={cx} y1={deckY} x2={cx} y2={cy} />);
  }

  return (
    <g key="chenab">
      {/* Gorge walls: the 359 m is above a riverbed, not above ground. */}
      <path
        d={`M ${x} ${GROUND} L ${x + 34} ${GROUND - 210} L ${x0} ${deckY} M ${x + FOOTPRINT.chenab} ${GROUND} L ${x + FOOTPRINT.chenab - 34} ${GROUND - 210} L ${x1} ${deckY}`}
        className="stroke-sheet-ink/25"
        strokeWidth={2}
        fill="none"
      />
      <path
        className="draw stroke-sheet-navy"
        pathLength={1}
        style={{ ["--stagger" as string]: "0s" }}
        d={`M ${x0} ${GROUND - 40} Q ${mid} ${GROUND - 330} ${x1} ${GROUND - 40}`}
        strokeWidth={5}
        fill="none"
      />
      <g className="stays stroke-sheet-navy/40" strokeWidth={2}>
        {columns}
      </g>
      <path
        className="draw stroke-sheet-ink"
        pathLength={1}
        style={{ ["--stagger" as string]: "0.2s" }}
        d={`M ${x0 - 26} ${deckY} L ${x1 + 26} ${deckY}`}
        strokeWidth={6}
        fill="none"
      />
    </g>
  );
}

function Bhakra(x: number) {
  const base = 191;
  const crest = 9;
  const h = 226;
  const x0 = x + FOOTPRINT.bhakra - base - 20;
  const top = GROUND - h;
  const water = GROUND - h + 20;

  return (
    <g key="bhakra">
      {/* Impounded water, to the height it is retained at. */}
      <path d={`M ${x} ${water} L ${x0} ${water} L ${x0} ${GROUND} L ${x} ${GROUND} Z`} className="fill-sheet-navy/12" />
      <line x1={x} y1={water} x2={x0} y2={water} className="stroke-sheet-navy/40" strokeWidth={1.5} />
      <path
        d={`M ${x0} ${GROUND} L ${x0} ${top} L ${x0 + crest} ${top} L ${x0 + base} ${GROUND} Z`}
        className="fill-sheet-navy/10"
      />
      <path
        className="draw stroke-sheet-navy"
        pathLength={1}
        style={{ ["--stagger" as string]: "0.12s" }}
        d={`M ${x0} ${GROUND} L ${x0} ${top} L ${x0 + crest} ${top} L ${x0 + base} ${GROUND} Z`}
        strokeWidth={5}
        fill="none"
      />
      {/* Uplift under the base — the force a gravity section is shaped to resist. */}
      <g className="stays stroke-sheet-rust" strokeWidth={1.6}>
        {[0.25, 0.5, 0.75].map((t) => {
          const ax = x0 + base * t;
          return (
            <g key={t}>
              <line x1={ax} y1={GROUND + 22} x2={ax} y2={GROUND + 5} />
              <path d={`M ${ax - 4} ${GROUND + 11} L ${ax} ${GROUND + 5} L ${ax + 4} ${GROUND + 11}`} fill="none" />
            </g>
          );
        })}
      </g>
    </g>
  );
}

function BandraWorli(x: number) {
  const total = 500;
  const x0 = x + (FOOTPRINT["bandra-worli"] - total) / 2;
  const x1 = x0 + total;
  const mid = (x0 + x1) / 2;
  const deckY = GROUND - 22;
  const pylonTop = GROUND - 126;

  const stays = [];
  for (let i = 1; i <= 7; i += 1) {
    const t = i / 8;
    const top = pylonTop + (126 - 26) * (i / 11);
    stays.push(<line key={`l${i}`} x1={mid} y1={top} x2={mid - 250 * t} y2={deckY} />);
    stays.push(<line key={`r${i}`} x1={mid} y1={top} x2={mid + 250 * t} y2={deckY} />);
  }

  return (
    <g key="bandra-worli">
      <line x1={x} y1={GROUND} x2={x + FOOTPRINT["bandra-worli"]} y2={GROUND} className="stroke-sheet-navy/25" strokeWidth={1.5} />
      <g className="stays stroke-sheet-navy/50" strokeWidth={1.5}>
        {stays}
      </g>
      <path
        className="draw stroke-sheet-navy"
        pathLength={1}
        style={{ ["--stagger" as string]: "0.24s" }}
        d={`M ${mid} ${deckY} L ${mid} ${pylonTop}`}
        strokeWidth={7}
        fill="none"
      />
      <path
        className="draw stroke-sheet-ink"
        pathLength={1}
        style={{ ["--stagger" as string]: "0.36s" }}
        d={`M ${x0 - 34} ${deckY} L ${x1 + 34} ${deckY}`}
        strokeWidth={6}
        fill="none"
      />
      <g className="stroke-sheet-ink/40" strokeWidth={3}>
        {[x0, x1, x0 - 34, x1 + 34].map((px, i) => (
          <line key={i} x1={px} y1={deckY} x2={px} y2={GROUND} />
        ))}
      </g>
    </g>
  );
}

function Howrah(x: number) {
  const span = 457;
  const x0 = x + (FOOTPRINT.howrah - span) / 2;
  const x1 = x0 + span;
  const deckY = GROUND - 16;
  const towerTop = GROUND - 82;

  const web = [];
  const bays = 16;
  const chord = (cx: number) => {
    const t = (cx - x0) / span;
    return towerTop + 46 * (1 - Math.pow(2 * t - 1, 2));
  };
  for (let i = 0; i < bays; i += 1) {
    const xa = x0 + (span / bays) * i;
    const xb = x0 + (span / bays) * (i + 1);
    web.push(<line key={`a${i}`} x1={xa} y1={chord(xa)} x2={xb} y2={deckY} />);
    web.push(<line key={`b${i}`} x1={xa} y1={deckY} x2={xb} y2={chord(xb)} />);
  }

  return (
    <g key="howrah">
      <line x1={x} y1={GROUND} x2={x + FOOTPRINT.howrah} y2={GROUND} className="stroke-sheet-navy/25" strokeWidth={1.5} />
      <g className="stays stroke-sheet-navy/35" strokeWidth={1.3}>
        {web}
      </g>
      <path
        className="draw stroke-sheet-navy"
        pathLength={1}
        style={{ ["--stagger" as string]: "0.48s" }}
        d={`M ${x0} ${towerTop} Q ${(x0 + x1) / 2} ${towerTop + 92} ${x1} ${towerTop}`}
        strokeWidth={4}
        fill="none"
      />
      <g className="stroke-sheet-navy" strokeWidth={6}>
        <line x1={x0} y1={GROUND} x2={x0} y2={towerTop} />
        <line x1={x1} y1={GROUND} x2={x1} y2={towerTop} />
      </g>
      <path
        className="draw stroke-sheet-ink"
        pathLength={1}
        style={{ ["--stagger" as string]: "0.6s" }}
        d={`M ${x0 - 55} ${deckY} L ${x1 + 55} ${deckY}`}
        strokeWidth={6}
        fill="none"
      />
    </g>
  );
}

const DRAW: Record<string, (x: number) => React.ReactElement> = {
  chenab: Chenab,
  bhakra: Bhakra,
  "bandra-worli": BandraWorli,
  howrah: Howrah,
};

export function ComparativePlate() {
  return (
    <svg
      viewBox={`0 -20 ${TOTAL_WIDTH} ${SHEET_METRES + 90}`}
      className="w-full"
      role="img"
      aria-label={`Four Indian civil structures drawn to a single scale on a common ground line: ${REFERENCE_STRUCTURES.map(
        (s) => `${s.name}, ${s.heightMetres} metres`,
      ).join("; ")}.`}
    >
      {/* Ground line, heavier than any structure's own linework so the eye
          finds the datum the comparison rests on. */}
      <line
        x1={0}
        y1={GROUND}
        x2={TOTAL_WIDTH}
        y2={GROUND}
        className="stroke-sheet-ink"
        strokeWidth={2.5}
      />

      {REFERENCE_STRUCTURES.map((s) => DRAW[s.id](OFFSET[s.id]))}

      {/* Height dimensions and names, hung off each structure's own footprint. */}
      {REFERENCE_STRUCTURES.map((s, i) => {
        const x = OFFSET[s.id];
        const top = GROUND - s.heightMetres;
        return (
          <g key={`dim-${s.id}`} className="dim" style={{ ["--stagger" as string]: `${0.5 + i * 0.08}s` }}>
            <g className="stroke-sheet-ink/30" strokeWidth={1.1}>
              <line x1={x - 12} y1={GROUND} x2={x - 12} y2={top} />
              <line x1={x - 18} y1={GROUND} x2={x - 6} y2={GROUND} />
              <line x1={x - 18} y1={top} x2={x - 6} y2={top} />
            </g>
            <text
              x={x - 24}
              y={top + 15}
              textAnchor="end"
              className="fill-sheet-ink/55 font-mono"
              fontSize={19}
            >
              {s.heightMetres} m
            </text>
            <text
              x={x + FOOTPRINT[s.id] / 2}
              y={GROUND + 42}
              textAnchor="middle"
              className="fill-sheet-ink font-sans"
              fontSize={21}
              fontWeight={600}
            >
              {s.name}
            </text>
            <text
              x={x + FOOTPRINT[s.id] / 2}
              y={GROUND + 66}
              textAnchor="middle"
              className="fill-sheet-ink/50 font-mono"
              fontSize={17}
            >
              {s.year} · {s.typology}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
