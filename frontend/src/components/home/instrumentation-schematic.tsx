"use client";

/**
 * A typical instrumentation layout, drawn as a schematic.
 *
 * Deliberately a GENERIC girder span, not one of the named structures. Marking
 * sensor stations on a drawing of a real bridge would read as an installation
 * that exists; on an unnamed span it reads as what it is — where this class of
 * instrument goes on this class of structure.
 *
 * No values are shown. The stations are positions and instrument types, both of
 * which are design facts; a reading would be an invention.
 */

const W = 640;
const H = 260;
const DECK = 150;
const GROUND = 214;

/** Instrument stations: position along the span, and what sits there. */
const PIERS = [96, 320, 544];
/** Mid-span of each of the two main spans. */
const MID_LEFT = (PIERS[0] + PIERS[1]) / 2;
const MID_RIGHT = (PIERS[1] + PIERS[2]) / 2;

/**
 * Instrument stations, placed where each quantity is actually worth measuring:
 * strain over the bearings where it concentrates, acceleration and deflection
 * at mid-span where the mode shape is largest, temperature on the soffit.
 * Nothing sits on a pier, which would collide with the pier line and put a
 * deflection gauge at the one point that does not deflect.
 */
interface Station {
  x: number;
  label: string;
  title: string;
  /** Hangs below the soffit rather than sitting above the deck. */
  below?: boolean;
}

const STATIONS: Station[] = [
  { x: PIERS[0], label: "S", title: "Strain gauge — bearing zone" },
  { x: MID_LEFT, label: "A", title: "Accelerometer — mid-span" },
  { x: MID_LEFT, label: "D", title: "Displacement — mid-span", below: true },
  { x: PIERS[1], label: "S", title: "Strain gauge — bearing zone" },
  { x: MID_RIGHT, label: "A", title: "Accelerometer — mid-span" },
  { x: MID_RIGHT, label: "T", title: "Temperature — deck soffit", below: true },
  { x: PIERS[2], label: "S", title: "Strain gauge — bearing zone" },
];

export function InstrumentationSchematic() {
  return (
    <figure className="w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Schematic elevation of a typical three-span girder bridge, showing where strain gauges, accelerometers, displacement sensors and temperature sensors are placed, and the gateway that collects them."
      >
        {/* Datum */}
        <line
          x1={0}
          y1={GROUND}
          x2={W}
          y2={GROUND}
          className="stroke-sheet-ink/35"
          strokeWidth={1.5}
          strokeDasharray="6 5"
        />

        {/* Deck */}
        <path
          className="draw stroke-sheet-ink"
          pathLength={1}
          style={{ animationDelay: "0.1s" }}
          d={`M 24 ${DECK} L ${W - 24} ${DECK}`}
          strokeWidth={7}
          fill="none"
        />
        {/* Girder soffit */}
        <path
          className="draw stroke-sheet-navy/70"
          pathLength={1}
          style={{ animationDelay: "0.25s" }}
          d={`M 24 ${DECK + 14} L ${W - 24} ${DECK + 14}`}
          strokeWidth={2}
          fill="none"
        />

        {/* Piers */}
        <g className="stroke-sheet-navy" strokeWidth={6}>
          {PIERS.map((x) => (
            <line key={x} x1={x} y1={DECK + 14} x2={x} y2={GROUND} />
          ))}
        </g>
        {/* Abutments */}
        <g className="stroke-sheet-navy/60" strokeWidth={4}>
          <line x1={24} y1={DECK + 14} x2={24} y2={GROUND} />
          <line x1={W - 24} y1={DECK + 14} x2={W - 24} y2={GROUND} />
        </g>

        {/* Span dimension string */}
        <g className="dim" style={{ ["--stagger" as string]: "0.2s" }}>
          <g className="stroke-sheet-ink/35" strokeWidth={1}>
            <line x1={PIERS[0]} y1={GROUND + 22} x2={PIERS[1]} y2={GROUND + 22} />
            <line x1={PIERS[0]} y1={GROUND + 16} x2={PIERS[0]} y2={GROUND + 28} />
            <line x1={PIERS[1]} y1={GROUND + 16} x2={PIERS[1]} y2={GROUND + 28} />
          </g>
          <text
            x={MID_LEFT}
            y={GROUND + 38}
            textAnchor="middle"
            className="fill-sheet-ink/50 font-mono"
            fontSize={10}
          >
            span
          </text>
        </g>

        {/* Instrument stations */}
        <g className="dim" style={{ ["--stagger" as string]: "0.45s" }}>
          {STATIONS.map((s, i) => {
            // Above-deck instruments sit above; below-deck ones hang under the
            // soffit. Where two share an x, the second is pushed further out.
            const y = s.below ? DECK + 46 : DECK - 26;
            return (
              <g key={i}>
                <title>{s.title}</title>
                <line
                  x1={s.x}
                  y1={s.below ? DECK + 14 : DECK}
                  x2={s.x}
                  y2={s.below ? y - 8 : y + 9}
                  className="stroke-sheet-navy"
                  strokeWidth={1.2}
                />
                <rect
                  x={s.x - 9}
                  y={y - 9}
                  width={18}
                  height={18}
                  rx={2}
                  className="fill-sheet-paper stroke-sheet-navy"
                  strokeWidth={1.4}
                />
                <text
                  x={s.x}
                  y={y + 4}
                  textAnchor="middle"
                  className="fill-sheet-navy font-mono"
                  fontSize={11}
                  fontWeight={600}
                >
                  {s.label}
                </text>
              </g>
            );
          })}
        </g>

        {/* Gateway, and the link back to the platform */}
        <g className="dim" style={{ ["--stagger" as string]: "0.6s" }}>
          <line
            x1={W - 78}
            y1={DECK - 26}
            x2={W - 78}
            y2={DECK - 52}
            className="stroke-sheet-navy"
            strokeWidth={1.2}
          />
          <rect
            x={W - 118}
            y={DECK - 74}
            width={80}
            height={24}
            rx={3}
            className="fill-sheet-navy"
          />
          <text
            x={W - 78}
            y={DECK - 58}
            textAnchor="middle"
            className="fill-sheet-paper font-mono"
            fontSize={10}
            letterSpacing={0.6}
          >
            gateway
          </text>
        </g>
      </svg>

      <figcaption className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-sheet-ink/12 pt-3 font-mono text-label text-sheet-ink/55">
        <span>Typical instrumentation — schematic</span>
        <span className="flex flex-wrap gap-x-4">
          <span>S strain</span>
          <span>A acceleration</span>
          <span>D displacement</span>
          <span>T temperature</span>
        </span>
      </figcaption>
    </figure>
  );
}
