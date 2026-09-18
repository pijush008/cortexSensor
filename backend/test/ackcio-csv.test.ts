import { describe, expect, test } from "vitest";
import {
  csvToEnvelope,
  offsetFromHeader,
  parseCsv,
  parseFileName,
  parseLocalDateTime,
  parseReadingHeader,
  parseUtcOffset,
  sensorIndexForCode,
} from "../src/modules/ingestion/ackcio-csv";
import { ackcioEnvelopeSchema, sensorTelemetrySchema } from "../src/modules/ackcio/ackcio.types";

/**
 * The Ackcio Beam Gateway FTP Specification v1.5, example by example.
 * No file system, no database: text in, push-shaped envelope out.
 */

const IST = 330;

describe("file names", () => {
  test("SensorData with a plain project name", () => {
    expect(parseFileName("SensorData_93d4_Test Project_5e72_VW Node_Shaft 2.csv")).toEqual({
      fileType: "SensorData",
      gatewayKey: "93d4",
      nodeKey: "5e72",
      projectName: "Test Project",
      nodeName: "VW Node",
      sensorLabel: "Shaft 2",
    });
  });

  test("a project name containing underscores does not shift the node id", () => {
    expect(parseFileName("ErrorSensorData_CFA0_Level_76_123c_123c_TM-123c.csv")).toMatchObject({
      fileType: "ErrorSensorData",
      gatewayKey: "CFA0",
      projectName: "Level_76",
      nodeKey: "123c",
      nodeName: "123c",
      sensorLabel: "TM-123c",
    });
  });

  test("node-level files carry no sensor label", () => {
    expect(parseFileName("NodeData_93d4_Test Project_5e72_VW Node.csv")).toMatchObject({
      fileType: "NodeData",
      nodeKey: "5e72",
      nodeName: "VW Node",
      sensorLabel: null,
    });
    expect(parseFileName("NetworkData_93d4_Test Project_5e72_VW Node.csv")?.fileType).toBe("NetworkData");
  });

  test("a heartbeat file names only the gateway", () => {
    expect(parseFileName("/srv/ftp/incoming/HeartbeatData_cfa0.csv")).toEqual({
      fileType: "HeartbeatData",
      gatewayKey: "cfa0",
      nodeKey: null,
      projectName: null,
      nodeName: null,
      sensorLabel: null,
    });
  });

  test("the specification's non-hex node ids are recognised", () => {
    expect(parseFileName("SensorData_F01E_TestProject_dg100_DG-NODE-1_IPI_North.csv")).toMatchObject({
      nodeKey: "dg100", nodeName: "DG-NODE-1", sensorLabel: "IPI_North", projectName: "TestProject",
    });
    expect(parseFileName("NodeData_F01E_TestProject_an105_AN-NODE-5.csv")).toMatchObject({ nodeKey: "an105", nodeName: "AN-NODE-5" });
  });

  test("a node the gateway already reported anchors an otherwise ambiguous name", () => {
    // "Phase2" looks like an id; the known node wins.
    expect(parseFileName("SensorData_F01E_Delhi_Metro_Phase2_node7_Pier 4_VW-S1.csv", ["node7"])).toMatchObject({
      projectName: "Delhi_Metro_Phase2", nodeKey: "node7", nodeName: "Pier 4", sensorLabel: "VW-S1",
    });
  });

  test("anything else is refused rather than guessed at", () => {
    expect(parseFileName("readme.txt")).toBeNull();
    expect(parseFileName("Export_93d4_x.csv")).toBeNull();
    expect(parseFileName("SensorData_93d4.csv")).toBeNull();
  });
});

describe("dates and zones", () => {
  test("the three date shapes the gateway writes", () => {
    // 2020/10/03 15:50:22 IST = 10:20:22 UTC
    expect(parseLocalDateTime("2020/10/03 15:50:22", IST)).toBe(Date.UTC(2020, 9, 3, 10, 20, 22) / 1000);
    expect(parseLocalDateTime("2020-10-26 14:00:00", 0)).toBe(Date.UTC(2020, 9, 26, 14, 0, 0) / 1000);
    // Day first.
    expect(parseLocalDateTime("22/04/2021 12:52:26", 0)).toBe(Date.UTC(2021, 3, 22, 12, 52, 26) / 1000);
    expect(parseLocalDateTime("not a date", 0)).toBeNull();
  });

  test("a header zone overrides the configured one", () => {
    expect(offsetFromHeader("Date Time (UTC+08:00)")).toBe(480);
    expect(offsetFromHeader("Date Time")).toBeNull();
    expect(parseUtcOffset("+05:30")).toBe(330);
    expect(parseUtcOffset("-03:00")).toBe(-180);
    expect(parseUtcOffset("UTC+08:00")).toBe(480);
  });
});

describe("reading headers", () => {
  test("code, kind, channel type and unit", () => {
    expect(parseReadingHeader("VW-S1-Reading-Frequency (Hz)", 1)).toEqual({
      index: 1, code: "VW-S1", kind: "Reading", channelType: "Frequency", unit: "Hz",
    });
    expect(parseReadingHeader("VW-S1-RawReading-Temperature (Ω)", 4)).toMatchObject({
      code: "VW-S1", kind: "RawReading", channelType: "Temperature", unit: "Ω",
    });
    expect(parseReadingHeader("TM-123c-RawReading-A (V)", 1)).toMatchObject({ code: "TM-123c", channelType: "A", unit: "V" });
    expect(parseReadingHeader("Description", 2)).toBeNull();
  });

  test("the sensor index derived from a code is stable and clear of real node indexes", () => {
    expect(sensorIndexForCode("VW-S1")).toBe(sensorIndexForCode("vw-s1"));
    expect(sensorIndexForCode("VW-S1")).not.toBe(sensorIndexForCode("VW-S2"));
    expect(sensorIndexForCode("VW-S1")).toBeGreaterThanOrEqual(10_000);
  });
});

describe("CSV", () => {
  test("quoted fields, embedded commas and CRLF", () => {
    expect(parseCsv('"a","b,c",d\r\n1,"say ""hi""",3\r\n')).toEqual([["a", "b,c", "d"], ["1", 'say "hi"', "3"]]);
  });
});

describe("envelopes from the specification's files", () => {
  test("§2.1 SensorData: one telemetry per row, every channel with reading and raw", () => {
    const text =
      '"Date Time","VW-S1-Reading-Frequency (Hz)","VW-S1-RawReading-Frequency (Hz)","VW-S1-Reading-Temperature (Ω)","VW-S1-RawReading-Temperature (Ω)","VW-S1-Reading-SignalQuality (%)","VW-S1-RawReading-SignalQuality (%)"\n' +
      '"2020/10/03 15:50:22",848.763793945312,848.763793945312,30.12,2399,99,99\n' +
      '"2020/10/03 16:50:22",850.1,850.1,30.5,2400,98,98\n';
    const out = csvToEnvelope("SensorData_93d4_Test Project_5e72_VW Node_VW-S1.csv", text, { defaultOffsetMinutes: IST });
    expect(out.rowsTotal).toBe(2);
    expect(out.skipped).toEqual([]);
    expect(out.envelope.Type).toBe("SensorData");
    expect(out.envelope.Telemetries).toHaveLength(2);
    expect(ackcioEnvelopeSchema.safeParse(out.envelope).success).toBe(true);

    const t = sensorTelemetrySchema.parse(out.envelope.Telemetries[0]);
    expect(t.GatewayDeviceId).toBe("93d4");
    expect(t.DeviceId).toBe("5e72");
    expect(t.DeviceName).toBe("VW Node");
    expect(t.ProjectName).toBe("Test Project");
    expect(t.Timestamp).toBe(Date.UTC(2020, 9, 3, 10, 20, 22) / 1000);
    expect(t.Sensor.Code).toBe("VW-S1");
    expect(t.Sensor.SensorId).toBe(sensorIndexForCode("VW-S1"));
    expect(t.Sensor.Channels).toHaveLength(3);
    expect(t.Sensor.Channels[1]).toMatchObject({
      ChannelId: 1, ChannelType: "Temperature", Reading: 30.12, RawReading: 2399, UnitType: "Ω", Description: "valid",
    });
  });

  test("a grouped file holds several sensors per row", () => {
    const text =
      '"Date Time","DG_1Metre-Reading-A (Sinα)","DG_1Metre-RawReading-A (Sinα)","DG_2Metre-Reading-A (Sinα)","DG_2Metre-RawReading-A (Sinα)"\n' +
      '"2020-10-26 14:00:00",1.8,1.8,2.8,2.5\n';
    const out = csvToEnvelope("SensorData_F01E_TestProject_dg100_DG-NODE-1_IPI_North.csv", text, { defaultOffsetMinutes: 0 });
    expect(out.envelope.Telemetries).toHaveLength(2);
    const codes = out.envelope.Telemetries.map((t) => sensorTelemetrySchema.parse(t).Sensor.Code);
    expect(codes).toEqual(["DG_1Metre", "DG_2Metre"]);
    expect(sensorTelemetrySchema.parse(out.envelope.Telemetries[0]).Sensor.Group).toBe("IPI_North");
  });

  test("§2.7 ErrorSensorData: zone from the header, verdict per channel", () => {
    const text =
      '"Date Time (UTC+08:00)","TM-123c-RawReading-A (V)","Description","TM-123c-RawReading-B (V)","Description","TM-123c-RawReading-Temperature (ohms)","Description"\n' +
      '"07/04/2023 15:27:30",1.3423,"valid",1.2423,"valid",7157230,"error"\n';
    const out = csvToEnvelope("ErrorSensorData_CFA0_Level_76_123c_123c_TM-123c.csv", text, { defaultOffsetMinutes: IST });
    expect(out.offsetMinutes).toBe(480);
    expect(out.envelope.Type).toBe("ErrorSensorData");
    const t = sensorTelemetrySchema.parse(out.envelope.Telemetries[0]);
    expect(t.Timestamp).toBe(Date.UTC(2023, 3, 7, 7, 27, 30) / 1000);
    expect(t.Sensor.Channels.map((c) => c.Description)).toEqual(["valid", "valid", "error"]);
    expect(t.Sensor.Channels[2].RawReading).toBe(7157230);
    expect(t.Sensor.Channels[2].RawUnitType).toBe("ohms");
  });

  test("§2.2 NodeData", () => {
    const text = '"Date Time", "Battery (mV)"," Temperature (C)"," Humidity (%)"," Pressure (Pa)"\n"2020-10-26 14:00:00",3565,21.0799,33.326,101287.3671\n';
    const out = csvToEnvelope("NodeData_93d4_Test Project_5e72_VW Node.csv", text, { defaultOffsetMinutes: 0 });
    expect(out.envelope.Telemetries[0]).toMatchObject({
      DeviceId: "5e72", Battery: 3565, Temperature: 21.0799, Humidity: 33.326, Pressure: 101287.3671,
    });
  });

  test("§2.3 NetworkData", () => {
    const text = '"Date Time","NodeId","ParentId","Etx (%)","RSSI (dBm)"\n"2020-10-26 14:01:19",5e72,93d4,139,-53\n';
    const out = csvToEnvelope("NetworkData_93d4_Test Project_5e72_VW Node.csv", text, { defaultOffsetMinutes: 0 });
    expect(out.envelope.Telemetries[0]).toMatchObject({ DeviceId: "5e72", ParentId: "93d4", Etx: 139, Rssi: -53 });
  });

  test("§2.4 HeartbeatData, with an empty data-usage cell", () => {
    const text =
      '"Date Time","Disk Used (GB)","Disk Space (GB)","PowerInVolts (V)","PowerInCurrent (mA)","Temperature (C)","Humidity (%)","Pressure (Pa)","Data Usage (kB)","Internet Mode"\n' +
      '"22/04/2021 12:52:26",11.4,14.5,10.8199,120,39.513,78.082,100974.931,,"LAN"\n';
    const out = csvToEnvelope("HeartbeatData_cfa0.csv", text, { defaultOffsetMinutes: 0 });
    expect(out.envelope.Telemetries[0]).toMatchObject({
      GatewayDeviceId: "cfa0", DiskUsed: 11.4, DiskSpace: 14.5, PowerInVolts: 10.8199, InternetMode: "LAN",
    });
    expect((out.envelope.Telemetries[0] as { DataUsage?: unknown }).DataUsage).toBeUndefined();
  });

  test("a row with an unreadable date is skipped and reported, not stored as something else", () => {
    const text = '"Date Time","VW-S1-Reading-Frequency (Hz)","VW-S1-RawReading-Frequency (Hz)"\n"garbage",1,1\n"2020-10-26 14:00:00",2,2\n';
    const out = csvToEnvelope("SensorData_93d4_P_5e72_N_VW-S1.csv", text, { defaultOffsetMinutes: 0 });
    expect(out.envelope.Telemetries).toHaveLength(1);
    expect(out.skipped).toEqual(['row 2: unreadable date "garbage"']);
  });

  test("a file with no reading columns is an error, not an empty success", () => {
    expect(() => csvToEnvelope("SensorData_93d4_P_5e72_N_X.csv", '"Date Time","Notes"\n"2020-10-26 14:00:00","x"\n', { defaultOffsetMinutes: 0 })).toThrow(/No reading columns/);
  });
});
