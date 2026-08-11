#!/bin/bash
set -e

export DISPLAY="${DISPLAY:-:0}"
export HOME="${HOME:-/home/worker}"
export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-/opt/android-sdk}"
export ANDROID_AVD_HOME="${ANDROID_AVD_HOME:-/home/worker/.android/avd}"

echo "[Entrypoint] Starting App Relay Worker process on DISPLAY=${DISPLAY}..."

# 1. Create AVD if needed
/app/apps/worker/docker/create-avd.sh

# 2. Check if emulator is already running before launching a new process
AVD_NAME="${ANDROID_AVD:-chpay}"
EMU_ACCEL="${EMULATOR_ACCEL:-auto}"
ADB="${ADB_PATH:-adb}"

# WORKER_GUI=off bỏ hẳn cửa sổ emulator. Cửa sổ đó vẽ bằng swiftshader tức là
# render mềm trên CPU — trên VPS yếu nó ăn CPU liên tục kể cả khi không ai xem.
# Tắt đi thì Android vẫn chạy đủ, chỉ là không nhìn được qua noVNC nữa.
#
# Chỉ bật lại khi cần đăng nhập Google Play hoặc nhìn tận mắt lúc gỡ lỗi:
# sửa WORKER_GUI=on trong deploy/.env.worker rồi `docker compose up -d worker`.
WINDOW_FLAG=""
if [ "${WORKER_GUI:-on}" = "off" ]; then
    WINDOW_FLAG="-no-window"
    echo "[Entrypoint] WORKER_GUI=off — chạy emulator không cửa sổ (-no-window)."
fi

if "${ADB}" devices 2>/dev/null | grep -q "emulator-5554"; then
    echo "[Entrypoint] Emulator (emulator-5554) is already running."
else
    echo "[Entrypoint] Launching Android Emulator (${AVD_NAME})..."
    emulator \
        -avd "${AVD_NAME}" \
        -accel "${EMU_ACCEL}" \
        -no-audio \
        -no-boot-anim \
        -no-snapshot-save \
        ${WINDOW_FLAG} \
        -gpu swiftshader_indirect &
fi

# 3. Wait for emulator boot
/app/apps/worker/docker/wait-for-emulator.sh

# 4. Check Play Store
echo "[Entrypoint] Checking Google Play Store availability..."
if "${ADB}" shell pm list packages 2>/dev/null | grep -q "com.android.vending"; then
    echo "[Entrypoint] Google Play Store (com.android.vending) verified."
else
    echo "[Entrypoint] WARNING: Google Play Store (com.android.vending) not found on device."
fi

# 5. Start Node.js worker
echo "[Entrypoint] Starting Node.js worker process..."
exec node /app/apps/worker/dist/index.js
