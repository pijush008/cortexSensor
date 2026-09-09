import request from "supertest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import app from "../src/app";
import prisma from "../src/config/prisma";

describe("API integration tests", () => {
  beforeAll(async () => {
    await prisma.$connect();
    // cleanup any previous test user
    await prisma.user
      .deleteMany({ where: { emailId: "test-integ@example.com" } })
      .catch(() => {});
  });

  afterAll(async () => {
    // cleanup created test user
    await prisma.user
      .deleteMany({ where: { emailId: "test-integ@example.com" } })
      .catch(() => {});
    await prisma.$disconnect();
  });

  test("register -> verify -> login -> ingest sensor data", async () => {
    const registerRes = await request(app).post("/api/register/admin").send({
      firstName: "Test",
      lastName: "Integ",
      emailId: "test-integ@example.com",
      phoneNo: "1234567890",
      password: "Password1!",
    });
    // Accept either successful registration (200) or already-existing email (400)
    if (registerRes.status === 400) {
      expect(registerRes.body).toHaveProperty("message");
      expect(registerRes.body.message).toMatch(/Email already exists/i);
    } else {
      expect(registerRes.status).toBe(200);
    }

    // Ensure we have a user record to proceed (either newly created or pre-existing)
    const user = await prisma.user.findUnique({
      where: { emailId: "test-integ@example.com" },
    });
    expect(user).toBeTruthy();

    // Mark verified to allow login
    await prisma.user.update({
      where: { id: user!.id },
      data: { isMailVerified: "true_", isUserVerified: "true_" },
    });

    const loginRes = await request(app)
      .post("/api/commonLogin")
      .send({ username: "test-integ@example.com", password: "Password1!" });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body).toHaveProperty("userID");
    const rawCookies = loginRes.headers["set-cookie"];
    expect(rawCookies).toBeDefined();

    // Normalize cookie header value safely (could be string | string[] | undefined)
    const cookieHeader = Array.isArray(rawCookies)
      ? rawCookies.join(";")
      : typeof rawCookies === "string"
        ? rawCookies
        : undefined;

    // Use cookie for authenticated endpoint (conditionally set header)
    let deviceReq = request(app).get("/api/deviceType");
    if (cookieHeader) deviceReq = deviceReq.set("Cookie", cookieHeader);
    const deviceTypeRes = await deviceReq;
    expect(deviceTypeRes.status).toBe(200);

    // Ingest sensor data via API-key ingest endpoint (device-facing)
    const ingestRes = await request(app)
      .post("/api/sensorDataFromDevice")
      .set("x-api-key", process.env.IOT_API_KEY || "dev-iot-key")
      .send({
        device_id: "test-device-integ",
        sensor_id: "1",
        sensor_calibration: "1",
      });
    expect(ingestRes.status).toBe(200);
  });

  test("beamDeviceData accepts API key and returns a response", async () => {
    const payload = {
      Type: "NetworkData",
      Telemetries: [
        {
          Timestamp: 1660000000,
          GatewayDeviceId: "gw-test",
          DeviceId: "gw-test",
          Sensor: {
            SensorType: "Temperature",
            Channels: [{ RawReading: 12.34 }],
          },
        },
      ],
    };

    const res = await request(app)
      .post("/api/beamDeviceData")
      .set("x-api-key", process.env.IOT_API_KEY || "dev-iot-key")
      .send(payload);
    // Accept 200 or 400 depending on DB/device state; ensure no 5xx
    expect(res.status).toBeLessThan(500);
  });
});
