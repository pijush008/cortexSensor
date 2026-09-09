export const MQTT_BROKER_URL = process.env.NEXT_PUBLIC_MQTT_BROKER_URL ?? "";
export const MQTT_USER = process.env.NEXT_PUBLIC_MQTT_USER ?? "";
export const MQTT_PASS = process.env.NEXT_PUBLIC_MQTT_PASS ?? "";
export const MQTT_DEFAULT_TOPIC =
  process.env.NEXT_PUBLIC_MQTT_DEFAULT_TOPIC ?? "shm/feed/#";
export const MQTT_MESSAGE_LIMIT =
  Number(process.env.NEXT_PUBLIC_MQTT_MESSAGE_LIMIT) ?? 200;
