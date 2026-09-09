#ifndef SHM_WIFI_H
#define SHM_WIFI_H

#include "Arduino.h"

struct IPAddress {
  String toString() const { return String("0.0.0.0"); }
};

class WiFiClass {
public:
  static void mode(int) {}
  static void begin(const char*, const char*) {}
  static int status() { return 0; }
  static IPAddress localIP() { return IPAddress(); }
};

extern WiFiClass WiFi;
#define WL_CONNECTED 1

class WiFiClient {
public:
  WiFiClient() = default;
};

#endif // SHM_WIFI_H
