/**
 * Sample payloads copied from the ACKCIO Beam Gateway API Specification
 * v1.18, section by section. Kept verbatim (including the mixed-case gateway
 * ids and the string-typed heartbeat numbers) because the point of the
 * contract tests is the document, not a tidied-up version of it.
 *
 * A plain module, not a suite: vitest only collects `*.test.ts`.
 */

function vwChannels() {
  return [
    { ChannelId: 0, ChannelType: "Frequency", RawChannelType: "Frequency", RawReading: 875.8, RawUnitType: "Hz", Reading: 20.98, UnitType: "µε", Description: "valid" },
    { ChannelId: 1, ChannelType: "Temperature", RawChannelType: "Temperature", RawReading: 2098.5, RawUnitType: "Ω", Reading: 32.0, UnitType: "C", Description: "valid" },
    { ChannelId: 2, ChannelType: "SignalQuality", RawChannelType: "SignalQuality", RawReading: 99, RawUnitType: "%", Reading: 99, UnitType: "%", Description: "valid" },
  ];
}

/** §2 */
export const sensorDataVW = {
  Type: "SensorData",
  Version: "1.0.22.0310",
  Telemetries: [
    {
      GatewayDeviceId: "F01E",
      DeviceId: "ecde",
      DeviceName: "VW-NODE-1",
      DeviceType: "BEAM-VW-S1",
      ProjectName: "TestProject",
      Timestamp: 1544493651,
      Sensor: { SensorId: 0, Code: "SG2001", Group: "", SensorType: "VibratingWire", Address: "", Channels: vwChannels() },
    },
  ],
};

/** §3 */
export const nodeData = {
  Type: "NodeData",
  Version: "1.0.22.0310",
  Telemetries: [
    {
      GatewayDeviceId: "F01E",
      DeviceName: "VW-NODE-1",
      DeviceType: "BEAM-VW-S1",
      DeviceId: "cd100",
      ProjectName: "TestProject",
      Timestamp: 1596292891,
      Battery: 3888,
      Temperature: 28.1299,
      Humidity: 98.0,
      Pressure: 100813.7968,
    },
  ],
};

/** §4 */
export const networkData = {
  Type: "NetworkData",
  Version: "1.0.22.0310",
  Telemetries: [
    {
      GatewayDeviceId: "F01E",
      DeviceName: "VW-NODE-1",
      DeviceType: "BEAM-VW-S1",
      ProjectName: "TestProject",
      Timestamp: 1596292891,
      DeviceId: "cd100",
      ParentId: "cfa0",
      Etx: 93,
      Rssi: 73,
    },
  ],
};

/** §5 */
export const heartbeatData = {
  Type: "HeartbeatData",
  Version: "1.0.22.0310",
  Telemetries: [
    {
      GatewayDeviceId: "cfa0",
      Timestamp: 1615283057,
      Disk: "11.4GB free / 14.5GB total ( 18.0% )",
      DiskUsed: "11.4",
      DiskSpace: "14.5",
      PowerInVolts: 10.8199,
      PowerInCurrent: 120.0,
      Temperature: 39.513,
      Humidity: 78.082,
      Pressure: 100974.931,
      DataUsage: "123",
      InternetMode: "LAN",
    },
  ],
};

/** §6 */
export const errorSensorData = {
  Type: "ErrorSensorData",
  Version: "1.0.22.0310",
  Telemetries: [
    {
      Sensor: {
        SensorId: 0,
        Code: "TM-123c",
        Group: "TM-123c",
        SensorType: "SISGEOTiltmeter",
        Address: "",
        Channels: [
          { ChannelId: 0, ChannelType: "A", RawChannelType: "A", Reading: 1.3423, RawReading: 1.3423, UnitType: "", RawUnitType: "V", Description: "valid" },
          { ChannelId: 1, ChannelType: "B", RawChannelType: "B", Reading: 1.2423, RawReading: 1.2423, UnitType: "", RawUnitType: "V", Description: "valid" },
          { ChannelId: 2, ChannelType: "Temperature", RawChannelType: "Temperature", Reading: -92.85, RawReading: 7157230.0, UnitType: "C", RawUnitType: "ohms", Description: "error" },
        ],
      },
      GatewayDeviceId: "CFA0",
      DeviceId: "123c",
      DeviceName: "123c",
      ProjectName: "Level_76",
      DeviceType: "BEAM-TM-S1",
      Timestamp: 1680852450,
    },
  ],
};

/** §7 */
export const sensorDataRetryBatch = {
  Type: "SensorData",
  Version: "1.0.22.0310",
  Telemetries: [
    {
      GatewayDeviceId: "F01E",
      DeviceId: "ecde",
      DeviceName: "VW-NODE-1",
      DeviceType: "BEAM-VW-S1",
      ProjectName: "TestProject",
      Timestamp: 1544493666,
      Sensor: { SensorId: 0, Code: "SG2001", Group: "", SensorType: "VibratingWire", Address: "", Channels: vwChannels() },
    },
    {
      GatewayDeviceId: "F01E",
      DeviceId: "abdc",
      DeviceName: "VW-NODE-2",
      DeviceType: "BEAM-VW-S1",
      ProjectName: "TestProject",
      Timestamp: 1544493677,
      Sensor: { SensorId: 0, Code: "SG2002", Group: "", Address: "", SensorType: "VibratingWire", Channels: vwChannels() },
    },
  ],
};

/** §8 */
export const virtualSensor = {
  Type: "SensorData",
  Version: "1.0.22.0310",
  Telemetries: [
    {
      GatewayDeviceId: "F01E",
      DeviceId: "cd100",
      DeviceName: "VW-NODE-8",
      DeviceType: "BEAM-VW-S8",
      ProjectName: "TestProject",
      Timestamp: 1544493651,
      Sensor: {
        SensorId: 8,
        Code: "Virtual-SG2001",
        Group: "",
        SensorType: "Virtual",
        Address: "",
        Channels: [
          { ChannelId: 0, ChannelType: "Virtual", RawChannelType: "Virtual", RawReading: 1875.8, RawUnitType: "Hz", Reading: 1875.8, UnitType: "Hz", Description: "valid" },
        ],
      },
    },
  ],
};

function an(sensorId: number, code: string, sensorType: string, channels: unknown[]) {
  return {
    GatewayDeviceId: "F01E",
    DeviceId: "an105",
    DeviceName: "AN-NODE-5",
    DeviceType: "BEAM-AN-S4",
    ProjectName: "TestProject",
    Timestamp: 1604556293,
    Sensor: { SensorId: sensorId, Code: code, Group: "", SensorType: sensorType, Address: "", Channels: channels },
  };
}

/** §9, the BEAM-AN-S4 batch */
export const analogueS4Batch = {
  Type: "SensorData",
  Version: "1.0.22.0310",
  Telemetries: [
    an(0, "AN5001", "LVDT", [
      { ChannelId: 0, ChannelType: "A", RawChannelType: "A", RawReading: 1347.489, RawUnitType: "mV/V", Reading: 1347.489, UnitType: "mV/V", Description: "valid" },
    ]),
    an(1, "AN6001", "WheatstoneBridge", [
      { ChannelId: 0, ChannelType: "A", RawChannelType: "A", RawReading: 3.567, RawUnitType: "mV", Reading: 3.567, UnitType: "mV", Description: "valid" },
    ]),
    an(2, "AN7001", "Voltage", [
      { ChannelId: 0, ChannelType: "A", RawChannelType: "A", RawReading: 9.88, RawUnitType: "V", Reading: 9.88, UnitType: "V", Description: "valid" },
      { ChannelId: 1, ChannelType: "B", RawChannelType: "B", RawReading: 9.58, RawUnitType: "V", Reading: 9.58, UnitType: "V", Description: "valid" },
      { ChannelId: 2, ChannelType: "Temperature", RawChannelType: "Temperature", RawReading: 3136, RawUnitType: "Ω", Reading: 3136, UnitType: "Ω", Description: "valid" },
    ]),
    an(3, "AN8001", "CurrentLoop", [
      { ChannelId: 0, ChannelType: "A", RawChannelType: "A", RawReading: 4.8, RawUnitType: "mA", Reading: 4.8, UnitType: "mA", Description: "valid" },
      { ChannelId: 1, ChannelType: "B", RawChannelType: "B", RawReading: 4.5, RawUnitType: "mA", Reading: 4.5, UnitType: "mA", Description: "valid" },
      { ChannelId: 2, ChannelType: "Temperature", RawChannelType: "Temperature", RawReading: 3456, RawUnitType: "Ω", Reading: 3456, UnitType: "Ω", Description: "valid" },
    ]),
  ],
};

/** §10, one ShapeArray segment */
export const shapeArray = {
  Type: "SensorData",
  Version: "1.0.22.0310",
  Telemetries: [
    {
      GatewayDeviceId: "F01E",
      DeviceId: "dg100",
      DeviceName: "DG-NODE-1",
      DeviceType: "BEAM-DG",
      ProjectName: "TestProject",
      Timestamp: 1554403651,
      Sensor: {
        SensorId: 0,
        Code: "DG2001",
        Group: "SAA_GRP",
        SensorType: "RS485MEASURANDShapeArray",
        Address: "2001",
        Channels: [
          { ChannelId: 0, ChannelType: "A", RawChannelType: "A", RawReading: 13423, RawUnitType: "", Reading: 13423, UnitType: "", Description: "valid" },
          { ChannelId: 1, ChannelType: "B", RawChannelType: "B", RawReading: 12412, RawUnitType: "", Reading: 12412, UnitType: "", Description: "valid" },
          { ChannelId: 2, ChannelType: "C", RawChannelType: "C", RawReading: 12312, RawUnitType: "", Reading: 12312, UnitType: "", Description: "valid" },
          { ChannelId: 3, ChannelType: "Temperature", RawChannelType: "Temperature", RawReading: 12123, RawUnitType: "", Reading: 12123, UnitType: "", Description: "valid" },
        ],
      },
    },
  ],
};

/**
 * A whole SAA chain in one push, as §10 says the gateway sends it: one
 * telemetry per segment, all on the same node, SensorId counting up.
 */
export function shapeArrayChain(segments: number, gatewayId = "F01E", nodeId = "dg100") {
  const base = shapeArray.Telemetries[0];
  return {
    Type: "SensorData",
    Version: "1.0.22.0310",
    Telemetries: Array.from({ length: segments }, (_, i) => ({
      ...base,
      GatewayDeviceId: gatewayId,
      DeviceId: nodeId,
      Sensor: { ...base.Sensor, SensorId: i, Code: `DG_${i + 1}Metre`, Address: String(2001 + i) },
    })),
  };
}

function yp(sensorId: number, code: string, address: string, letters: string[], temp: number) {
  return {
    GatewayDeviceId: "F01E",
    DeviceId: "ec00",
    DeviceName: "DG-NODE-100",
    DeviceType: "BEAM-DG",
    ProjectName: "TestProject",
    Timestamp: 1612956854,
    Sensor: {
      SensorId: sensorId,
      Code: code,
      Group: "",
      SensorType: "RS232YieldPointDMUX",
      Address: address,
      Channels: [
        { ChannelId: 0, ChannelType: "Temperature", RawChannelType: "Temperature", RawReading: temp, RawUnitType: "", Reading: temp, UnitType: "", Description: "valid" },
        ...letters.map((l, i) => ({ ChannelId: i + 1, ChannelType: l, RawChannelType: l, RawReading: i + 1.5, RawUnitType: "", Reading: i + 1.5, UnitType: "", Description: "valid" })),
      ],
    },
  };
}

/** §12 */
export const yieldPoint = {
  Type: "SensorData",
  Version: "1.0.22.0310",
  Telemetries: [
    yp(0, "YP1Sensor", "1001", ["A", "B", "C", "D", "E", "F"], 23.45),
    yp(1, "YP2Sensor", "1002", ["A", "B", "C"], 23.45),
    yp(2, "YP3Sensor", "1003", ["A"], 32.85),
  ],
};

/** Re-keys any sample onto a different gateway and node, for isolation tests. */
export function rekey<T extends { Telemetries: unknown[] }>(sample: T, gatewayId: string, nodeId?: string): T {
  return {
    ...sample,
    Telemetries: sample.Telemetries.map((t) => ({
      ...(t as Record<string, unknown>),
      GatewayDeviceId: gatewayId,
      ...(nodeId && (t as Record<string, unknown>).DeviceId !== undefined ? { DeviceId: nodeId } : {}),
    })),
  };
}
