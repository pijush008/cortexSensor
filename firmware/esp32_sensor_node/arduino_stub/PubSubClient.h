#ifndef SHM_PUBSUBCLIENT_H
#define SHM_PUBSUBCLIENT_H

#include "Arduino.h"

class WiFiClient;

class PubSubClient {
public:
  PubSubClient(WiFiClient&) {}
  void setServer(const char*, int) {}
  bool connected() { return true; }
  bool connect(const char*, const char*, const char*) { return true; }
  void loop() {}
  bool publish(const char*, const char*) { return true; }
  int state() { return 0; }
};

#endif // SHM_PUBSUBCLIENT_H
