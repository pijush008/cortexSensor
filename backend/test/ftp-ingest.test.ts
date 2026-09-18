import fs from "fs/promises";
import os from "os";
import path from "path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import app from "../src/app";
import prisma from "../src/config/prisma";
import { scanOnce, SUBDIRS } from "../src/modules/ingestion/ingestion.service";
import { TINY_PNG } from "./fixtures/registration";

/**
 * The FTP drop, end to end: files appear in incoming/, rows appear in the
 * database, and each file ends up where its outcome says — processed/,
 * failed/ or unknown/ — with a ledger row saying why.
 */

const EMAIL = "ftp-admin@example.com";
const EMAIL_OTHER = "ftp-other@example.com";
const PASSWORD = "Password1!";
const KEY = "F7A1";

let root = "";
let cookie = "";
let otherCookie = "";
let tenantId = 0;
let gatewayId = 0;

function cookieHeader(raw: unknown): string {
  const c = Array.isArray(raw) ? raw.join(";") : typeof raw === "string" ? raw : "";
  if (!c) throw new Error("No auth cookies returned");
  return c;
}

async function registerAndLogin(email: string) {
  await request(app).post("/api/v1/register/admin").send({
    companyName: `FTP Org ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    companyLogo: TINY_PNG,
    firstName: "Ftp",
    lastName: "Admin",
    emailId: email,
    phoneNo: "1234567890",
    password: PASSWORD,
  });
  const user = await prisma.user.findUniqueOrThrow({ where: { emailId: email } });
  await prisma.user.update({ where: { id: user.id }, data: { isMailVerified: "true_", isUserVerified: "true_" } });
  const login = await request(app).post("/api/v1/commonLogin").send({ username: email, password: PASSWORD });
  expect(login.status, JSON.stringify(login.body)).toBe(200);
  const membership = await prisma.membership.findFirstOrThrow({ where: { userId: user.id } });
  return { userId: user.id, tenantId: membership.tenantId, cookie: cookieHeader(login.headers["set-cookie"]) };
}

async function cleanup() {
  const users = await prisma.user.findMany({ where: { emailId: { in: [EMAIL, EMAIL_OTHER] } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  const tenantIds = (await prisma.membership.findMany({ where: { userId: { in: ids } }, select: { tenantId: true } })).map((m) => m.tenantId);
  const wipe = (fn: () => Promise<unknown>) => fn().catch(() => undefined);
  const devices = await prisma.device.findMany({ where: { gatewayDeviceId: KEY }, select: { id: true } });
  const deviceIds = devices.map((d) => d.id);
  await wipe(() => prisma.ingestionFile.deleteMany({ where: { OR: [{ gatewayKey: { in: [KEY, "ZZ99", "f7a1"] } }, { fileName: { startsWith: "readme" } }, { fileName: { contains: "broken" } }] } }));
  await wipe(() => prisma.gatewayReading.deleteMany({ where: { gatewayKey: KEY } }));
  await wipe(() => prisma.nodeNetworkData.deleteMany({ where: { gatewayKey: KEY } }));
  await wipe(() => prisma.gatewayHeartbeat.deleteMany({ where: { gatewayKey: KEY } }));
  await wipe(() => prisma.nodeData.deleteMany({ where: { gatewayDeviceId: KEY } }));
  await wipe(() => prisma.measurement.deleteMany({ where: { tenantId: { in: tenantIds } } }));
  await wipe(() => prisma.sensorAssignment.deleteMany({ where: { tenantId: { in: tenantIds } } }));
  await wipe(() => prisma.deviceChannel.deleteMany({ where: { deviceId: { in: deviceIds.map(String) } } }));
  await wipe(() => prisma.device.deleteMany({ where: { id: { in: deviceIds } } }));
  await wipe(() => prisma.sensor.deleteMany({ where: { tenantId: { in: tenantIds } } }));
  await wipe(() => prisma.gateway.deleteMany({ where: { gatewayKey: KEY } }));
  await wipe(() => prisma.subscription.deleteMany({ where: { adminId: { in: ids } } }));
  await wipe(() => prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } }));
  await wipe(() => prisma.auditLog.deleteMany({ where: { userId: { in: ids } } }));
  await wipe(() => prisma.membership.deleteMany({ where: { userId: { in: ids } } }));
  await wipe(() => prisma.user.deleteMany({ where: { id: { in: ids } } }));
  await wipe(() => prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } }));
}

const SENSOR_CSV =
  '"Date Time","VW-S1-Reading-Frequency (Hz)","VW-S1-RawReading-Frequency (Hz)","VW-S1-Reading-Temperature (Ω)","VW-S1-RawReading-Temperature (Ω)"\n' +
  '"2020/10/03 15:50:22",848.76,848.76,30.12,2399\n' +
  '"2020/10/03 16:50:22",850.10,850.10,30.50,2400\n';

async function drop(name: string, text: string): Promise<string> {
  const full = path.join(root, SUBDIRS.incoming, name);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, text);
  return full;
}

async function listDir(sub: string): Promise<string[]> {
  const dir = path.join(root, sub);
  const out: string[] = [];
  const walk = async (d: string) => {
    for (const entry of await fs.readdir(d, { withFileTypes: true }).catch(() => [])) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) await walk(p);
      else out.push(path.relative(dir, p));
    }
  };
  await walk(dir);
  return out.sort();
}

beforeAll(async () => {
  await prisma.$connect();
  await cleanup();
  root = await fs.mkdtemp(path.join(os.tmpdir(), "shm-ftp-"));
  const admin = await registerAndLogin(EMAIL);
  cookie = admin.cookie;
  tenantId = admin.tenantId;
  otherCookie = (await registerAndLogin(EMAIL_OTHER)).cookie;
  const gw = await request(app).post("/api/v1/gateways").set("Cookie", cookie).send({ gatewayKey: KEY, name: "FTP gateway" });
  expect(gw.status, JSON.stringify(gw.body)).toBe(201);
  gatewayId = gw.body.data.id;
});

afterAll(async () => {
  await cleanup();
  await fs.rm(root, { recursive: true, force: true });
  await prisma.$disconnect();
});

describe("the FTP drop", () => {
  test("a SensorData file is stored, ledgered and moved to processed/", async () => {
    await drop(`SensorData_${KEY}_Test Project_5e72_VW Node_VW-S1.csv`, SENSOR_CSV);
    const results = await scanOnce(root, 0);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ status: "processed", rowsTotal: 2, rowsStored: 4, rowsDuplicate: 0 });

    expect(await listDir(SUBDIRS.incoming)).toEqual([]);
    const processed = await listDir(SUBDIRS.processed);
    expect(processed).toHaveLength(1);
    expect(processed[0]).toMatch(/^\d{4}-\d{2}-\d{2}\/SensorData_/);

    const ledger = await prisma.ingestionFile.findFirstOrThrow({ where: { gatewayKey: KEY, fileType: "SensorData" } });
    expect(ledger).toMatchObject({ status: "processed", tenantId, gatewayId, nodeKey: "5e72", rowsTotal: 2, rowsStored: 4, rowsDuplicate: 0 });
    expect(ledger.filePath).toContain(SUBDIRS.processed);

    // The node and its two channels were discovered; two rows of two channels.
    const device = await prisma.device.findFirstOrThrow({ where: { gatewayId, deviceId: "5e72" } });
    expect(device.deviceName).toBe("VW Node");
    const readings = await prisma.gatewayReading.findMany({ where: { gatewayId, nodeKey: "5e72" }, orderBy: [{ ts: "asc" }, { channelId: "asc" }] });
    expect(readings).toHaveLength(4);
    expect(readings[0]).toMatchObject({ code: "VW-S1", channelType: "Frequency", reading: 848.76, rawReading: 848.76, unit: "Hz" });
    // 15:50:22 in the configured zone (+05:30 by default) is 10:20:22 UTC.
    expect(readings[0].ts.toISOString()).toBe("2020-10-03T10:20:22.000Z");
    expect(await prisma.measurement.count({ where: { tenantId, gatewayId } })).toBe(4);
  });

  test("the same file uploaded again is skipped as a duplicate", async () => {
    await drop(`SensorData_${KEY}_Test Project_5e72_VW Node_VW-S1.csv`, SENSOR_CSV);
    const [r] = await scanOnce(root, 0);
    expect(r.status).toBe("duplicate");
    expect(await prisma.gatewayReading.count({ where: { gatewayId } })).toBe(4);
    expect(await prisma.ingestionFile.count({ where: { gatewayKey: KEY, fileType: "SensorData" } })).toBe(1);
  });

  test("a re-upload with rows appended stores only the new rows, on the same sensors", async () => {
    const appended = SENSOR_CSV + '"2020/10/03 17:50:22",851.00,851.00,30.90,2401\n';
    await drop(`SensorData_${KEY}_Test Project_5e72_VW Node_VW-S1.csv`, appended);
    const [r] = await scanOnce(root, 0);
    expect(r).toMatchObject({ status: "processed", rowsTotal: 3, rowsStored: 2, rowsDuplicate: 4 });
    expect(await prisma.gatewayReading.count({ where: { gatewayId } })).toBe(6);
    const device = await prisma.device.findFirstOrThrow({ where: { gatewayId, deviceId: "5e72" } });
    expect(await prisma.deviceChannel.count({ where: { deviceId: String(device.id) } })).toBe(2);
  });

  test("node health, link and heartbeat files each land in their table", async () => {
    await drop(`NodeData_${KEY}_Test Project_5e72_VW Node.csv`, '"Date Time","Battery (mV)","Temperature (C)","Humidity (%)","Pressure (Pa)"\n"2020-10-26 14:00:00",3565,21.0799,33.326,101287.3671\n');
    await drop(`NetworkData_${KEY}_Test Project_5e72_VW Node.csv`, '"Date Time","NodeId","ParentId","Etx (%)","RSSI (dBm)"\n"2020-10-26 14:01:19",5e72,f7a1,139,-53\n');
    await drop(`HeartbeatData_${KEY.toLowerCase()}.csv`, '"Date Time","Disk Used (GB)","Disk Space (GB)","PowerInVolts (V)","PowerInCurrent (mA)","Temperature (C)","Humidity (%)","Pressure (Pa)","Data Usage (kB)","Internet Mode"\n"22/04/2021 12:52:26",11.4,14.5,10.8199,120,39.513,78.082,100974.931,,"LAN"\n');
    const results = await scanOnce(root, 0);
    expect(results.map((r) => r.status)).toEqual(["processed", "processed", "processed"]);
    expect((await prisma.nodeData.findFirst({ where: { gatewayDeviceId: KEY, deviceId: "5e72" } }))?.batteryMillivolts).toBe(3565);
    expect(await prisma.nodeNetworkData.findFirst({ where: { gatewayKey: KEY, nodeKey: "5e72" } })).toMatchObject({ parentKey: "f7a1", etx: 139, rssi: -53 });
    expect(await prisma.gatewayHeartbeat.findFirst({ where: { gatewayId } })).toMatchObject({ internetMode: "LAN", diskUsed: 11.4 });
    // The lower-case heartbeat name matched the registered key.
    expect((await prisma.gateway.findUniqueOrThrow({ where: { id: gatewayId } })).lastSeenAt).toBeTruthy();
  });

  test("a file from an unregistered gateway is kept in unknown/ and assigned to nobody", async () => {
    await drop("SensorData_ZZ99_Somewhere_ab12_Node_VW-S1.csv", SENSOR_CSV);
    const [r] = await scanOnce(root, 0);
    expect(r.status).toBe("unknown_gateway");
    expect(r.error).toContain("ZZ99");
    expect(await listDir(SUBDIRS.unknown)).toEqual(["SensorData_ZZ99_Somewhere_ab12_Node_VW-S1.csv"]);
    const ledger = await prisma.ingestionFile.findFirstOrThrow({ where: { gatewayKey: "ZZ99" } });
    expect(ledger.status).toBe("unknown_gateway");
    expect(ledger.tenantId).toBeNull();
    expect(await prisma.device.count({ where: { deviceId: "ab12" } })).toBe(0);
    expect(await prisma.gatewayReading.count({ where: { gatewayKey: "ZZ99" } })).toBe(0);
  });

  test("a broken file is kept in failed/ with its error", async () => {
    await drop(`SensorData_${KEY}_Test Project_5e72_VW Node_broken.csv`, '"Date Time","Notes"\n"2020-10-26 14:00:00","x"\n');
    await drop("readme.txt", "hello");
    const results = await scanOnce(root, 0);
    expect(results.map((r) => r.status).sort()).toEqual(["failed", "failed"]);
    expect((await listDir(SUBDIRS.failed)).sort()).toEqual([`SensorData_${KEY}_Test Project_5e72_VW Node_broken.csv`, "readme.txt"]);
    const ledger = await prisma.ingestionFile.findFirstOrThrow({ where: { fileName: { contains: "broken" } } });
    expect(ledger.status).toBe("failed");
    expect(ledger.error).toMatch(/No reading columns/);
  });

  test("a file still being written is left for the next pass", async () => {
    await drop(`NodeData_${KEY}_Test Project_5e72_VW Node.csv`, '"Date Time","Battery (mV)","Temperature (C)","Humidity (%)","Pressure (Pa)"\n"2020-10-27 14:00:00",3500,21,33,101287\n');
    const [r] = await scanOnce(root, 60_000);
    expect(r.status).toBe("skipped");
    expect(await listDir(SUBDIRS.incoming)).toHaveLength(1);
    const [r2] = await scanOnce(root, 0);
    expect(r2.status).toBe("processed");
  });

  test("the ledger is tenant-scoped in the console", async () => {
    const mine = await request(app).get("/api/v1/ingestion/files").set("Cookie", cookie);
    expect(mine.status, JSON.stringify(mine.body)).toBe(200);
    expect(mine.body.items.length).toBeGreaterThanOrEqual(5);
    expect(mine.body.items.every((f: { tenantId: number }) => f.tenantId === tenantId)).toBe(true);
    // The unknown-gateway file belongs to nobody, so it is not in this list.
    expect(mine.body.items.some((f: { gatewayKey: string }) => f.gatewayKey === "ZZ99")).toBe(false);

    const theirs = await request(app).get("/api/v1/ingestion/files").set("Cookie", otherCookie);
    expect(theirs.status).toBe(200);
    expect(theirs.body.items.some((f: { gatewayKey: string }) => f.gatewayKey === KEY)).toBe(false);

    const failed = await request(app).get("/api/v1/ingestion/files?status=failed").set("Cookie", cookie);
    expect(failed.body.items.every((f: { status: string }) => f.status === "failed")).toBe(true);
  });
});
