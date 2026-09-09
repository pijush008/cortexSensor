#!/usr/bin/env bash
set -euo pipefail

if ! command -v arduino-cli >/dev/null 2>&1; then
  echo "arduino-cli not found. Please install arduino-cli first: https://arduino.github.io/arduino-cli/latest/installation/"
  exit 2
fi

echo "Updating core index..."
arduino-cli core update-index

echo "Installing esp32 core (if not installed)..."
arduino-cli core install esp32:esp32 || true

echo "Installed cores:"
arduino-cli core list

echo "To get include paths for IntelliSense, run:"
echo "  arduino-cli core list --format json"
echo "Look for 'installed' entries and the 'path' field; add '<path>/libraries' and '<path>/cores' to .vscode/c_cpp_properties.json includePath."

echo "Done."
