#!/bin/bash
set -e

ADB="${ADB_PATH:-adb}"
BOOT_TIMEOUT="${EMULATOR_BOOT_TIMEOUT:-600}"

# 2147483647 = INT32_MAX mili-giây (~24,8 ngày). Android hiểu đây là "không bao
# giờ tắt màn hình". Giá trị cũ là 1800000 (30 phút): worker rảnh quá 30 phút là
# màn hình ngủ, và job kế tiếp fail ở bước tìm phần tử UI chứ không báo lỗi gì
# liên quan tới màn hình — cực khó lần ra.
SCREEN_OFF_TIMEOUT="${EMULATOR_SCREEN_OFF_TIMEOUT:-2147483647}"

ELAPSED=0

# ─────────────────────────────────────────────────────────────────────────────
# 1. Chờ adb AUTHORIZED, không chỉ chờ thiết bị xuất hiện
# ─────────────────────────────────────────────────────────────────────────────
# Vài giây đầu emulator hiện ở trạng thái "offline"/"unauthorized". Mọi lệnh
# `adb shell` gửi lúc đó fail với "device unauthorized" NHƯNG adb vẫn thoát mã 0,
# nên `set -e` không bắt được — lệnh trượt trong im lặng.
echo "[Emulator] Waiting for adb to authorize the device (timeout: ${BOOT_TIMEOUT}s)..."
until [ "$("${ADB}" get-state 2>/dev/null | tr -d '\r')" = "device" ]; do
    if [ "${ELAPSED}" -ge "${BOOT_TIMEOUT}" ]; then
        echo "[Emulator] ERROR: adb never reached state 'device' within ${BOOT_TIMEOUT}s." >&2
        echo "[Emulator]        adb devices output:" >&2
        "${ADB}" devices >&2 || true
        exit 1
    fi
    sleep 2
    ELAPSED=$((ELAPSED + 2))
done
echo "[Emulator] adb authorized after ${ELAPSED}s."

# ─────────────────────────────────────────────────────────────────────────────
# 2. Chờ Android boot xong
# ─────────────────────────────────────────────────────────────────────────────
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

# ─────────────────────────────────────────────────────────────────────────────
# 3. Đặt screen_off_timeout — GHI RỒI ĐỌC LẠI ĐỂ KIỂM CHỨNG
# ─────────────────────────────────────────────────────────────────────────────
# `adb shell settings put` thoát mã 0 kể cả khi lệnh bên trong thiết bị hỏng,
# nên cách duy nhất biết nó có ăn hay không là đọc lại giá trị.
apply_screen_off_timeout() {
    local want="$1"
    local got=""
    local try=0

    while [ "${try}" -lt 10 ]; do
        "${ADB}" shell settings put system screen_off_timeout "${want}" >/dev/null 2>&1 || true
        got="$("${ADB}" shell settings get system screen_off_timeout 2>/dev/null | tr -d '\r')"
        if [ "${got}" = "${want}" ]; then
            echo "[Emulator] screen_off_timeout = ${got} (verified after $((try + 1)) attempt(s))."
            return 0
        fi
        try=$((try + 1))
        sleep 2
    done

    echo "[Emulator] ERROR: screen_off_timeout is '${got}', expected '${want}' after ${try} attempts." >&2
    return 1
}

if ! apply_screen_off_timeout "${SCREEN_OFF_TIMEOUT}"; then
    # Thoát hẳn thay vì cảnh báo rồi chạy tiếp: màn hình ngủ giữa chừng làm job
    # fail với thông báo không liên quan gì tới màn hình. Chết ở đây, lúc còn
    # nhìn thấy nguyên nhân, rẻ hơn nhiều.
    echo "[Emulator] Refusing to start the worker with an unverified screen timeout." >&2
    exit 1
fi

echo "[Emulator] Emulator is ready."
