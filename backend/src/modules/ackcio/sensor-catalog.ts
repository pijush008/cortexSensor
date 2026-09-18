/**
 * How an Ackcio sensor channel maps onto the platform's sensor catalogue.
 *
 * The platform keeps ONE Sensor row per measured quantity, typed by a
 * SensorType row that names the instrument and carries its unit. An Ackcio
 * node reports one or more sensors, each with several channels — a vibrating
 * wire gauge sends Frequency, Temperature and SignalQuality — and every one of
 * those channels is its own time series. So each channel becomes a platform
 * Sensor, and this module decides what the SensorType for it is called.
 *
 * The channel type is decisive where it names a quantity on its own
 * (Temperature is temperature whatever it is bolted to). Where the channel
 * is just a letter — "A", "B", "C" for a tiltmeter's axes — the sensor type
 * decides. Anything unrecognised is kept under its own Ackcio name rather than
 * forced into the nearest existing type; a wrong label on a bridge sensor is
 * worse than an unfamiliar one.
 */

export interface CatalogEntry {
  /** Display name for the SensorType row, e.g. "Vibrating Wire". */
  typeName: string;
  /** Whether the channel is an auxiliary reading rather than the measurand. */
  auxiliary: boolean;
}

const CHANNEL_QUANTITIES: Record<string, string> = {
  temperature: "Temperature",
  humidity: "Humidity Sensor",
  pressure: "Pressure",
  signalquality: "Signal Quality",
  supplyvoltage: "Supply Voltage",
  pulsecounter: "Pulse Counter",
  frequency: "Vibrating Wire",
  saamode: "Shape Array",
  shapearraymode: "Shape Array",
};

/** Channel types that describe the sensor's health rather than the structure. */
const AUXILIARY_CHANNELS = new Set(["signalquality", "supplyvoltage"]);

/**
 * Ackcio SensorType names, matched as lower-case substrings in the order
 * listed: the first pattern that occurs in the name wins.
 */
const SENSOR_TYPE_PATTERNS: Array<[pattern: string, typeName: string]> = [
  ["vibratingwire", "Vibrating Wire"],
  ["vwraingauge", "Rain Gauge"],
  ["vwpressure", "Vibrating Wire"],
  ["wheatstone", "Wheatstone Bridge"],
  ["currentloop", "Current Loop"],
  ["lvdt", "LVDT"],
  ["potentiometer", "Potentiometer"],
  ["loadcell", "Load Cell"],
  ["piezometer", "Piezometer"],
  ["shapearray", "Shape Array"],
  ["tiltmeter", "Inclinometer"],
  ["inclinometer", "Inclinometer"],
  ["extenso", "Extensometer"],
  ["bhprofile", "Inclinometer"],
  ["yieldpoint", "YieldPoint"],
  ["temperature", "Temperature"],
  ["cs650655", "Soil Moisture"],
  ["aquatroll", "Water Quality"],
  ["virtual", "Virtual"],
  ["voltage", "Voltage"],
];

function normalise(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Turns "RS485MEASURANDShapeArray" or "SDI12ENCARDIOTiltmeter" into something
 * a person would write on a label, for the fallback where nothing matched.
 */
export function humaniseAckcioType(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "Ackcio Sensor";
  return trimmed
    .replace(/^(RS485|RS232|SDI12)[-_ ]?/i, (m) => `${m.replace(/[-_ ]/g, "").toUpperCase()} `)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function catalogEntryFor(
  sensorType: string | null | undefined,
  channelType: string | null | undefined,
): CatalogEntry {
  const channel = normalise(channelType);
  const auxiliary = AUXILIARY_CHANNELS.has(channel);

  const byChannel = CHANNEL_QUANTITIES[channel];
  if (byChannel) return { typeName: byChannel, auxiliary };

  const type = normalise(sensorType);
  for (const [pattern, typeName] of SENSOR_TYPE_PATTERNS) {
    if (type.includes(pattern)) return { typeName, auxiliary };
  }

  return { typeName: humaniseAckcioType(sensorType ?? ""), auxiliary };
}

/**
 * The name the platform Sensor row gets, built from what the operator typed
 * into the gateway. "SG2001 · Frequency" reads back to the Ackcio dashboard;
 * a single-channel sensor keeps just its code.
 */
export function sensorNameFor(
  code: string | null | undefined,
  channelType: string | null | undefined,
  channelCount: number,
  sensorIndex: number,
): string {
  const base = (code ?? "").trim() || `Sensor ${sensorIndex}`;
  const channel = (channelType ?? "").trim();
  if (channelCount <= 1 || !channel) return base.slice(0, 255);
  return `${base} · ${channel}`.slice(0, 255);
}
