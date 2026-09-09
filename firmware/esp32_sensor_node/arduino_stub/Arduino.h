// Minimal Arduino core stub for IntelliSense only.
#ifndef SHM_ARDUINO_H
#define SHM_ARDUINO_H

#include <string>
#include <cstring>
#include <cmath>
#include <cstdint>
#include <ctime>

// Minimal String class similar to Arduino's String
class String {
public:
  std::string s;
  String() : s() {}
  String(const char* c) : s(c ? c : "") {}
  String(const std::string& ss) : s(ss) {}
  String(int v) { s = std::to_string(v); }
  String(unsigned long v) { s = std::to_string(v); }
  String(float v, int precision = 2) {
    char buf[64];
    snprintf(buf, sizeof(buf), (precision>=0?"%.*f":"%f"), precision, v);
    s = buf;
  }
  String operator+(const String& o) const { return String((s + o.s).c_str()); }
  String& operator+=(const String& o) { s += o.s; return *this; }
  const char* c_str() const { return s.c_str(); }
  operator std::string() const { return s; }
};

// Basic Serial stub
class HardwareSerial {
public:
  void begin(unsigned long) {}
  void print(const String& v) {}
  void print(const char* v) {}
  void print(int v) {}
  void print(unsigned long v) {}
  void print(bool v) {}
  void println(const String& v) {}
  void println(const char* v) {}
  void println(int v) {}
  void println(unsigned long v) {}
  void println(bool v) {}
  void println() {}
};

// Define a static instance so IntelliSense recognises `Serial`.
static HardwareSerial Serial;

// Timing and utility functions
inline unsigned long millis() { return 0UL; }
inline void delay(unsigned long) {}
inline void randomSeed(unsigned long) {}

// Simple random overloads for IntelliSense (not cryptographic)
inline long random(long max) { return max > 0 ? max/2 : 0; }
inline long random(long min, long max) { return (min + max) / 2; }
inline int random(int min, int max) { return (min + max) / 2; }

inline int analogRead(int) { return 0; }

// Minimal configTime stub
inline void configTime(long, long, const char*, const char*) {}

// map common C functions into global namespace for IntelliSense
using std::strlen;
using std::snprintf;
using std::isnan;
using std::time;

// WIFI mode constant
#define WIFI_STA 1

// ESP stub
struct ESPClass {
  unsigned long long getEfuseMac() { return 0ULL; }
};
static ESPClass ESP;

// HEX macro used in Arduino prints
#define HEX 16

// Provide math functions into global namespace
using std::sin;
using std::cos;

#endif // SHM_ARDUINO_H
