#!/bin/bash
set -e

export DISPLAY="${DISPLAY:-:0}"
export HOME="${HOME:-/home/worker}"
export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-/opt/android-sdk}"
export ANDROID_AVD_HOME="${ANDROID_AVD_HOME:-/home/worker/.android/avd}"

echo "[Entrypoint] Starting App Relay Worker process on DISPLAY=${DISPLAY}..."

ADB="${ADB_PATH:-adb}"

# AVD và emulator KHÔNG còn khởi động ở đây — cả hai đã chuyển sang
# [program:emulator] của supervisord (run-emulator.sh). Lý do đầy đủ nằm trong
# đầu file đó; tóm tắt: emulator đẻ từ entrypoint là con của worker-node, chết
# thì không ai bật lại và không ai reap.
#
# Ở đây chỉ còn việc chờ nó sẵn sàng.

# 1. Wait for emulator boot
/app/apps/worker/docker/wait-for-emulator.sh

# 2. Check Play Store
echo "[Entrypoint] Checking Google Play Store availability..."
if "${ADB}" shell pm list packages 2>/dev/null | grep -q "com.android.vending"; then
    echo "[Entrypoint] Google Play Store (com.android.vending) verified."
else
    echo "[Entrypoint] WARNING: Google Play Store (com.android.vending) not found on device."
fi

# 3. Start Node.js worker
echo "[Entrypoint] Starting Node.js worker process..."
exec node /app/apps/worker/dist/index.js
