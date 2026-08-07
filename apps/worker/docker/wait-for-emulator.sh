#!/bin/bash
set -e

ADB="${ADB_PATH:-adb}"
BOOT_TIMEOUT="${EMULATOR_BOOT_TIMEOUT:-360}"
ELAPSED=0

echo "[Emulator] Waiting for emulator to complete boot (timeout: ${BOOT_TIMEOUT}s)..."
until [ "$("${ADB}" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do
    if [ "${ELAPSED}" -ge "${BOOT_TIMEOUT}" ]; then
        echo "[Emulator] ERROR: Emulator failed to boot within ${BOOT_TIMEOUT} seconds!" >&2
        exit 1
    fi
    sleep 2
    ELAPSED=$((ELAPSED + 2))
done

echo "[Emulator] Boot complete! Unlocking screen..."
"${ADB}" shell input keyevent KEYCODE_WAKEUP
"${ADB}" shell input keyevent 82
"${ADB}" shell settings put system screen_off_timeout 1800000

echo "[Emulator] Emulator is ready."
