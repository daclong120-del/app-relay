#!/bin/bash
#
# Emulator chạy như một program riêng của supervisord.
#
# Trước đây entrypoint.sh bật nó bằng `emulator ... &` rồi `exec node`, nên
# emulator thành tiến trình con của worker-node. Hệ quả khi qemu chết:
#
#   1. Không ai khởi động lại — supervisord chỉ theo dõi worker-node, mà
#      worker-node vẫn sống nhăn.
#   2. Không ai reap nó — node không gọi wait(), qemu nằm lại thành zombie.
#   3. Worker vẫn nhận job, và mọi job sau đó fail ở booting_emulator với
#      "No ADB device available" cho tới khi có người vào SSH restart container.
#
# Đặt emulator dưới supervisord với autorestart=true chữa cả ba.
#
set -e

export DISPLAY="${DISPLAY:-:0}"
export HOME="${HOME:-/home/worker}"
export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-/opt/android-sdk}"
export ANDROID_AVD_HOME="${ANDROID_AVD_HOME:-/home/worker/.android/avd}"

AVD_NAME="${ANDROID_AVD:-chpay}"
AVD_DIR="${ANDROID_AVD_HOME}/${AVD_NAME}.avd"

# Idempotent — thoát ngay nếu AVD đã có.
/app/apps/worker/docker/create-avd.sh

# Crash để lại lock, và emulator lần sau từ chối mở AVD "đang được dùng" —
# autorestart sẽ quay vòng vô ích mãi mãi. Dọn trước mỗi lần bật.
if [ -d "${AVD_DIR}" ]; then
    rm -rf "${AVD_DIR}"/*.lock 2>/dev/null || true
fi

WINDOW_FLAG=""
if [ "${WORKER_GUI:-on}" = "off" ]; then
    WINDOW_FLAG="-no-window"
    echo "[Emulator] WORKER_GUI=off — chạy không cửa sổ (-no-window)."
fi

echo "[Emulator] Launching ${AVD_NAME} (accel=${EMULATOR_ACCEL:-auto})..."

# exec: supervisord phải theo dõi chính qemu, không phải cái shell bọc ngoài —
# shell thoát ngay còn qemu chạy tiếp thì supervisord tưởng program đã chết.
exec emulator \
    -avd "${AVD_NAME}" \
    -accel "${EMULATOR_ACCEL:-auto}" \
    -no-audio \
    -no-boot-anim \
    -no-snapshot-save \
    ${WINDOW_FLAG} \
    -gpu swiftshader_indirect
