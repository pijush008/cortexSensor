import crypto from "crypto";

/**
 * The Ackcio Beam gateway's FTP files ("ACKCIO Beam Gateway FTP Specification"
 * v1.5), turned into the same envelope the HTTP push endpoint receives.
 *
 * One parser, two transports: a reading that arrived by FTP is stored by the
 * exact code that stores one that arrived by HTTP, so the two can never drift
 * in what they write. Everything here is pure — text in, envelope out — so it
 * can be tested against the specification's own examples without a file
 * system or a database.
 */

export type AckcioFileType =
  | "SensorData"
  | "ErrorSensorData"
  | "NodeData"
  | "NetworkData"
  | "HeartbeatData";

export const ACKCIO_FILE_TYPES: readonly AckcioFileType[] = [
  "SensorData",
  "ErrorSensorData",
  "NodeData",
  "NetworkData",
  "HeartbeatData",
];

export interface ParsedFileName {
  fileType: AckcioFileType;
  gatewayKey: string;
  /** Null for a heartbeat file, which names only the gateway. */
  nodeKey: string | null;
  projectName: string | null;
  nodeName: string | null;
  /** The sensor code or group the file is for; null for node-level files. */
  sensorLabel: string | null;
}

// ─── CSV ─────────────────────────────────────────────────────────────────────

/**
 * RFC 4180: comma separated, double quotes around fields that need them, a
 * doubled quote inside a quoted field, CRLF or LF line ends. The gateway's
 * files fit this exactly, including the quoted headers it writes.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;
  // Strip a UTF-8 BOM, which some writers prepend.
  if (text.charCodeAt(0) === 0xfeff) i = 1;

  for (; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // A trailing empty line is not a row.
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

// ─── File names ──────────────────────────────────────────────────────────────

const HEX_ID = /^[0-9a-f]{4,12}$/i;
/** The looser shape the spec's own examples use: "dg100", "an105", "ec00". */
const SHORT_ID = /^(?=.*\d)[0-9a-z]{3,12}$/i;

/**
 * `SensorData_<Gateway>_<Project>_<Node>_<NodeName>_<Code>.csv` and friends.
 *
 * Underscores are the separator AND legal inside a project name ("Level_76"
 * in the specification's own example), so a blind split is wrong. The node
 * id is what anchors the parse: the first segment after the gateway that looks
 * like an Ackcio hexadecimal id. Everything before it is the project name;
 * everything after is the node name and, for sensor files, the sensor label.
 * Where the tail is ambiguous the node name is taken as ONE segment and the
 * rest as the label: the label is what groups readings ("IPI_North" in the
 * specification's own example), while the node name is only a display name
 * that an HTTP push or an administrator can correct.
 */
export function parseFileName(fileName: string, knownNodeKeys: readonly string[] = []): ParsedFileName | null {
  const base = fileName.replace(/^.*[\\/]/, "").replace(/\.csv$/i, "");
  const parts = base.split("_");
  if (parts.length < 2) return null;

  const fileType = ACKCIO_FILE_TYPES.find((t) => t.toLowerCase() === parts[0].toLowerCase());
  if (!fileType) return null;
  const gatewayKey = parts[1].trim();
  if (!gatewayKey) return null;

  if (fileType === "HeartbeatData") {
    return { fileType, gatewayKey, nodeKey: null, projectName: null, nodeName: null, sensorLabel: null };
  }

  const rest = parts.slice(2);
  if (rest.length < 2) return null;

  // The node id, anchoring the parse. In order of confidence: a node this
  // gateway has already reported (an exact match), a hexadecimal id, a short
  // alphanumeric token with a digit in it (the shape of "dg100" and "an105"
  // in the specification's own examples), and finally the second segment —
  // a project name with no underscores being the common case.
  const tailLength = fileType === "SensorData" || fileType === "ErrorSensorData" ? 2 : 1;
  const last = rest.length - tailLength;
  const known = new Set(knownNodeKeys.map((k) => k.toLowerCase()));
  const pick = (test: (seg: string) => boolean): number => {
    for (let i = 1; i <= last; i++) if (test(rest[i])) return i;
    return -1;
  };
  let nodeIdx = pick((seg) => known.has(seg.toLowerCase()));
  if (nodeIdx === -1) nodeIdx = pick((seg) => HEX_ID.test(seg));
  if (nodeIdx === -1) nodeIdx = pick((seg) => SHORT_ID.test(seg));
  if (nodeIdx === -1) nodeIdx = Math.min(1, last);
  if (nodeIdx < 1) return null;

  const projectName = rest.slice(0, nodeIdx).join("_") || null;
  const nodeKey = rest[nodeIdx];
  const tail = rest.slice(nodeIdx + 1);
  if (tailLength === 2) {
    if (tail.length < 2) return null;
    return {
      fileType,
      gatewayKey,
      nodeKey,
      projectName,
      nodeName: tail[0],
      sensorLabel: tail.slice(1).join("_"),
    };
  }
  return { fileType, gatewayKey, nodeKey, projectName, nodeName: tail.join("_") || null, sensorLabel: null };
}

// ─── Dates ───────────────────────────────────────────────────────────────────

/** "+05:30" → minutes east of UTC. */
export function parseUtcOffset(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = /^\s*(?:UTC)?\s*([+-])(\d{1,2})(?::?(\d{2}))?\s*$/i.exec(text);
  if (!m) return null;
  const sign = m[1] === "-" ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3] ?? 0));
}

/** A "Date Time (UTC+08:00)" header carries the gateway's own zone. */
export function offsetFromHeader(header: string): number | null {
  const m = /\((UTC[^)]*)\)/i.exec(header);
  return m ? parseUtcOffset(m[1]) : null;
}

/**
 * The gateway writes LOCAL time in one of three shapes seen in the spec:
 * "2020/10/03 15:50:22", "2020-10-26 14:00:00" and "22/04/2021 12:52:26"
 * (day first). Returned as epoch seconds, with the offset applied.
 */
export function parseLocalDateTime(value: string, offsetMinutes: number): number | null {
  const v = value.trim();
  let y: number, mo: number, d: number;
  let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(v);
  if (m) {
    y = Number(m[1]); mo = Number(m[2]); d = Number(m[3]);
  } else {
    m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(v);
    if (!m) return null;
    d = Number(m[1]); mo = Number(m[2]); y = Number(m[3]);
  }
  const h = Number(m[4]);
  const mi = Number(m[5]);
  const s = Number(m[6] ?? 0);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  const utcMs = Date.UTC(y, mo - 1, d, h, mi, s) - offsetMinutes * 60_000;
  return Math.floor(utcMs / 1000);
}

// ─── Columns ─────────────────────────────────────────────────────────────────

interface ReadingColumn {
  index: number;
  code: string;
  kind: "Reading" | "RawReading";
  channelType: string;
  unit: string;
}

/** "VW-S1-Reading-Frequency (Hz)" → code, kind, channel type, unit. */
export function parseReadingHeader(header: string, index: number): ReadingColumn | null {
  const h = header.trim();
  const kindPos = Math.max(h.lastIndexOf("-RawReading-"), h.lastIndexOf("-Reading-"));
  if (kindPos <= 0) return null;
  const kind: "Reading" | "RawReading" = h.startsWith("-RawReading-", kindPos) ? "RawReading" : "Reading";
  const code = h.slice(0, kindPos);
  const after = h.slice(kindPos + (kind === "RawReading" ? "-RawReading-".length : "-Reading-".length));
  const unitMatch = /^(.*?)\s*\((.*)\)\s*$/.exec(after);
  const channelType = (unitMatch ? unitMatch[1] : after).trim();
  const unit = unitMatch ? unitMatch[2].trim() : "";
  if (!code || !channelType) return null;
  return { index, code, kind, channelType, unit };
}

function num(value: string | undefined): number | null {
  if (value === undefined) return null;
  const t = value.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * A stable sensor index for a sensor the CSV names only by code.
 *
 * The HTTP push carries an explicit SensorId; a CSV does not. The index is
 * part of the channel identity and the idempotency key, so it must be the
 * same every time this code is seen. A hash of the code, offset well above
 * any real Ackcio SensorId (which counts from 0 on a node), gives that.
 */
export function sensorIndexForCode(code: string): number {
  const h = crypto.createHash("sha256").update(code.trim().toLowerCase()).digest();
  return 10_000 + (h.readUInt32BE(0) % 90_000);
}

// ─── Envelope ────────────────────────────────────────────────────────────────

export interface CsvConversion {
  name: ParsedFileName;
  /** The push-shaped payload, ready for the ingest service. */
  envelope: { Type: string; Version: string; Telemetries: unknown[] };
  /** Data rows in the file, excluding the header. */
  rowsTotal: number;
  /** Rows skipped, each with a reason. */
  skipped: string[];
  /** The UTC offset the timestamps were read with, minutes east. */
  offsetMinutes: number;
}

export interface CsvOptions {
  /** Applied when the header does not name a zone. */
  defaultOffsetMinutes: number;
  /** Overrides the hash for known sensors: code → index. */
  sensorIndexFor?: (code: string) => number;
  /** Node ids the gateway has already reported, to anchor the file name parse. */
  knownNodeKeys?: readonly string[];
}

export function csvToEnvelope(fileName: string, text: string, opts: CsvOptions): CsvConversion {
  const name = parseFileName(fileName, opts.knownNodeKeys ?? []);
  if (!name) throw new Error(`Not an Ackcio file name: ${fileName}`);

  const rows = parseCsv(text);
  if (rows.length === 0) throw new Error("Empty file");
  const header = rows[0].map((h) => h.trim());
  const data = rows.slice(1);
  const skipped: string[] = [];

  const offsetMinutes = offsetFromHeader(header[0] ?? "") ?? opts.defaultOffsetMinutes;
  const indexFor = opts.sensorIndexFor ?? sensorIndexForCode;
  const version = "ftp-csv";
  const common = {
    GatewayDeviceId: name.gatewayKey,
    DeviceId: name.nodeKey ?? undefined,
    DeviceName: name.nodeName ?? undefined,
    ProjectName: name.projectName ?? undefined,
  };

  const telemetries: unknown[] = [];

  const timestampOf = (row: string[], rowNo: number): number | null => {
    const ts = parseLocalDateTime(row[0] ?? "", offsetMinutes);
    if (ts === null) skipped.push(`row ${rowNo}: unreadable date "${row[0] ?? ""}"`);
    return ts;
  };

  switch (name.fileType) {
    case "SensorData":
    case "ErrorSensorData": {
      // Columns grouped by sensor code, in order of first appearance; each
      // channel type collects its Reading and RawReading columns, and for an
      // error file the Description column that follows it.
      const columns = header
        .map((h, i) => (i === 0 ? null : parseReadingHeader(h, i)))
        .filter((c): c is ReadingColumn => c !== null);
      if (columns.length === 0) throw new Error("No reading columns in header");

      type Channel = { type: string; reading?: number; raw?: number; unit: string; rawUnit: string; descriptionIdx?: number; readingIdx?: number; rawIdx?: number };
      const sensors = new Map<string, Map<string, Channel>>();
      for (const c of columns) {
        const channels = sensors.get(c.code) ?? new Map<string, Channel>();
        const ch = channels.get(c.channelType) ?? { type: c.channelType, unit: "", rawUnit: "" };
        if (c.kind === "Reading") {
          ch.readingIdx = c.index;
          ch.unit = c.unit;
        } else {
          ch.rawIdx = c.index;
          ch.rawUnit = c.unit;
          // An error file writes "Description" straight after each raw column.
          if (header[c.index + 1]?.toLowerCase() === "description") ch.descriptionIdx = c.index + 1;
        }
        channels.set(c.channelType, ch);
        sensors.set(c.code, channels);
      }

      data.forEach((row, i) => {
        const ts = timestampOf(row, i + 2);
        if (ts === null) return;
        for (const [code, channels] of sensors) {
          const list = [...channels.values()];
          telemetries.push({
            ...common,
            Timestamp: ts,
            Sensor: {
              SensorId: indexFor(code),
              Code: code,
              Group: name.sensorLabel && name.sensorLabel !== code ? name.sensorLabel : "",
              SensorType: "",
              Address: "",
              Channels: list.map((ch, channelId) => {
                const reading = ch.readingIdx !== undefined ? num(row[ch.readingIdx]) : null;
                const raw = ch.rawIdx !== undefined ? num(row[ch.rawIdx]) : null;
                const description =
                  ch.descriptionIdx !== undefined ? (row[ch.descriptionIdx] ?? "").trim() || undefined : "valid";
                return {
                  ChannelId: channelId,
                  ChannelType: ch.type,
                  RawChannelType: ch.type,
                  Reading: reading ?? raw,
                  RawReading: raw ?? reading,
                  UnitType: ch.unit || ch.rawUnit,
                  RawUnitType: ch.rawUnit || ch.unit,
                  Description: description,
                };
              }),
            },
          });
        }
      });
      break;
    }

    case "NodeData": {
      const col = (label: string) => header.findIndex((h) => h.toLowerCase().startsWith(label));
      const battery = col("battery");
      const temperature = col("temperature");
      const humidity = col("humidity");
      const pressure = col("pressure");
      data.forEach((row, i) => {
        const ts = timestampOf(row, i + 2);
        if (ts === null) return;
        telemetries.push({
          ...common,
          Timestamp: ts,
          Battery: battery >= 0 ? num(row[battery]) ?? undefined : undefined,
          Temperature: temperature >= 0 ? num(row[temperature]) ?? undefined : undefined,
          Humidity: humidity >= 0 ? num(row[humidity]) ?? undefined : undefined,
          Pressure: pressure >= 0 ? num(row[pressure]) ?? undefined : undefined,
        });
      });
      break;
    }

    case "NetworkData": {
      const col = (label: string) => header.findIndex((h) => h.toLowerCase().startsWith(label));
      const nodeId = col("nodeid");
      const parentId = col("parentid");
      const etx = col("etx");
      const rssi = col("rssi");
      data.forEach((row, i) => {
        const ts = timestampOf(row, i + 2);
        if (ts === null) return;
        telemetries.push({
          ...common,
          DeviceId: (nodeId >= 0 && row[nodeId]?.trim()) || name.nodeKey || undefined,
          Timestamp: ts,
          ParentId: parentId >= 0 ? row[parentId]?.trim() || undefined : undefined,
          Etx: etx >= 0 ? num(row[etx]) ?? undefined : undefined,
          Rssi: rssi >= 0 ? num(row[rssi]) ?? undefined : undefined,
        });
      });
      break;
    }

    case "HeartbeatData": {
      const col = (label: string) => header.findIndex((h) => h.toLowerCase().replace(/\s+/g, "").startsWith(label));
      const fields: Array<[string, number]> = [
        ["DiskUsed", col("diskused")],
        ["DiskSpace", col("diskspace")],
        ["PowerInVolts", col("powerinvolts")],
        ["PowerInCurrent", col("powerincurrent")],
        ["Temperature", col("temperature")],
        ["Humidity", col("humidity")],
        ["Pressure", col("pressure")],
        ["DataUsage", col("datausage")],
      ];
      const mode = col("internetmode");
      data.forEach((row, i) => {
        const ts = timestampOf(row, i + 2);
        if (ts === null) return;
        const t: Record<string, unknown> = { GatewayDeviceId: name.gatewayKey, Timestamp: ts };
        for (const [key, idx] of fields) {
          if (idx >= 0) {
            const v = num(row[idx]);
            if (v !== null) t[key] = v;
          }
        }
        if (mode >= 0 && row[mode]?.trim()) t.InternetMode = row[mode].trim();
        telemetries.push(t);
      });
      break;
    }
  }

  return {
    name,
    envelope: { Type: name.fileType, Version: version, Telemetries: telemetries },
    rowsTotal: data.length,
    skipped,
    offsetMinutes,
  };
}
