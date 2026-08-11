#!/bin/bash
set -e

AVD_NAME="${ANDROID_AVD:-chpay}"
AVD_HOME="${ANDROID_AVD_HOME:-/home/worker/.android/avd}"
AVD_DIR="${AVD_HOME}/${AVD_NAME}.avd"

# Thư mục cha của avd/ — chính là gốc volume worker-avd. Seed bung vào đây chứ
# không phải vào AVD_HOME, vì trong tar đã có sẵn tầng `avd/`.
ANDROID_ROOT="$(dirname "${AVD_HOME}")"

# Seed nướng sẵn trong image (xem Dockerfile mục 4). Có file này nghĩa là ai đó
# đã đăng nhập Google Play một lần rồi chụp lại trạng thái bằng
# deploy/capture-avd-seed.sh — deploy máy mới không phải đăng nhập lại.
SEED_TARBALL="${AVD_SEED_PATH:-/opt/avd-seed/avd-seed.tar.gz}"

if [ -d "${AVD_DIR}" ]; then
    echo "[AVD] AVD ${AVD_NAME} already exists."
    exit 0
fi

mkdir -p "${AVD_HOME}"

# ---------------------------------------------------------------------------
# Đường 1: bung seed đã nướng sẵn (giữ nguyên phiên đăng nhập Google Play)
# ---------------------------------------------------------------------------
#
# AVD_SEED_DISABLE=1 để bỏ qua và tạo AVD trắng, dùng khi muốn đổi tài khoản
# hoặc khi nghi seed hỏng.
if [ -f "${SEED_TARBALL}" ] && [ "${AVD_SEED_DISABLE:-0}" != "1" ]; then
    echo "[AVD] Tìm thấy seed ${SEED_TARBALL} — bung thay vì tạo AVD mới."
    tar xzf "${SEED_TARBALL}" -C "${ANDROID_ROOT}"

    # Fail to ngay tại đây thay vì để entrypoint chạy tiếp. Seed chụp từ AVD tên
    # khác (ANDROID_AVD đổi giữa lúc chụp và lúc deploy) mà im lặng bỏ qua thì
    # bước dưới sẽ tạo AVD trắng — máy vẫn chạy, chỉ là mất sạch phiên đăng nhập
    # và không ai biết cho tới lúc Play Store hỏi mật khẩu.
    if [ ! -d "${AVD_DIR}" ]; then
        echo "[AVD] LỖI: seed không chứa AVD tên '${AVD_NAME}'." >&2
        echo "[AVD] Trong seed có: $(ls "${AVD_HOME}" 2>/dev/null | tr '\n' ' ')" >&2
        echo "[AVD] Sửa ANDROID_AVD trong deploy/.env.worker cho khớp, hoặc" >&2
        echo "[AVD] đặt AVD_SEED_DISABLE=1 để tạo AVD trắng và đăng nhập lại." >&2
        exit 1
    fi

    # Dọn sổ đăng ký emulator đang chạy của MÁY CŨ. capture-avd-seed.sh đã lọc
    # nó ra, nhưng bản seed nào chụp trước bản vá đó vẫn còn pid_NN.ini bên
    # trong — xoá ở đây thì seed cũ mới cũng sạch, và chi phí bằng không.
    rm -rf "${AVD_HOME}/running"

    # capture-avd-seed.sh cố ý bỏ sdcard.img ra khỏi seed: nó là 13 GB toàn số 0
    # và phiên đăng nhập không nằm trên đó (sdcard.img.qcow2 chỉ ~580 KB, tức là
    # gần như chưa ghi gì). Dựng lại ở đây rẻ hơn nhiều so với vác theo.
    if [ ! -f "${AVD_DIR}/sdcard.img" ]; then
        echo "[AVD] Dựng lại sdcard.img (${AVD_SDCARD_SIZE:-2G})..."
        mksdcard "${AVD_SDCARD_SIZE:-2G}" "${AVD_DIR}/sdcard.img"
    fi

    # File .ini trỏ tuyệt đối vào thư mục AVD. Trùng đường dẫn thì không sao,
    # nhưng ANDROID_AVD_HOME đổi được qua env nên ghi lại cho chắc.
    printf 'avd.ini.encoding=UTF-8\npath=%s\ntarget=android-35\n' "${AVD_DIR}" \
        > "${AVD_HOME}/${AVD_NAME}.ini"

    # adbkey đi kèm trong seed và bung ra ${ANDROID_ROOT}/adbkey. Kiểm ở đây vì
    # thiếu nó thì máy vẫn boot bình thường rồi chết ở chỗ khó đoán: emulator
    # lên, Android lên, nhưng MỌI lệnh adb trả "device unauthorized" do
    # /data/misc/adb/adb_keys trong seed chỉ chấp nhận khoá của máy cũ.
    if [ ! -f "${ANDROID_ROOT}/adbkey" ]; then
        echo "[AVD] CẢNH BÁO: seed không có adbkey." >&2
        echo "[AVD] adb sẽ sinh khoá mới và emulator sẽ từ chối nó" >&2
        echo "[AVD] ('device unauthorized'). Chụp lại seed bằng bản" >&2
        echo "[AVD] capture-avd-seed.sh mới để lấy kèm adbkey." >&2
    fi
    chmod 600 "${ANDROID_ROOT}/adbkey" 2>/dev/null || true

    echo "[AVD] Bung seed xong — phiên đăng nhập Google Play giữ nguyên."
    exit 0
fi

# ---------------------------------------------------------------------------
# Đường 2: tạo AVD trắng (phải đăng nhập Google Play bằng tay qua noVNC)
# ---------------------------------------------------------------------------
echo "[AVD] Creating AVD ${AVD_NAME}..."

# --sdcard/-c là MỘT cờ: "size of a new sdcard". Trước đây ở đây truyền cả
# `--sdcard 2G` lẫn `-c "${AVD_DATA_SIZE}"` với chú thích nói -c chỉnh data
# partition — sai. Cái sau ghi đè cái trước, nên AVD_DATA_SIZE=12G đẻ ra
# sdcard.img 12.8 GB toàn số 0 nằm chết trên đĩa, còn data partition thì suốt
# thời gian đó vẫn lấy kích thước từ disk.dataPartition.size bên dưới.
echo "no" | avdmanager create avd \
    --name "${AVD_NAME}" \
    --package "system-images;android-35;google_apis_playstore;x86_64" \
    --device "pixel_6" \
    --sdcard "${AVD_SDCARD_SIZE:-2G}" \
    --force

CONFIG="${AVD_DIR}/config.ini"
if [ -f "${CONFIG}" ]; then
    # Drop any pre-existing value before appending so re-runs stay idempotent.
    sed -i '/^hw\.ramSize=/d;/^vm\.heapSize=/d;/^disk\.dataPartition\.size=/d;/^hw\.keyboard=/d' "${CONFIG}"
    {
        # Đây mới là chỗ duy nhất quyết định kích thước data partition. Mặc định
        # của profile pixel_6 khoảng 2G, đầy ngay khi Play Store cache cộng vài
        # trăm MB APK rơi xuống.
        echo "hw.ramSize=${AVD_RAM_MB:-3072}"
        echo "vm.heapSize=${AVD_HEAP_MB:-512}"
        echo "disk.dataPartition.size=${AVD_DATA_SIZE:-12G}"
        echo "hw.keyboard=yes"
    } >> "${CONFIG}"
    echo "[AVD] Tuned ${CONFIG} (ram=${AVD_RAM_MB:-3072}MB, data=${AVD_DATA_SIZE:-12G}, sdcard=${AVD_SDCARD_SIZE:-2G})"
fi

echo "[AVD] AVD ${AVD_NAME} created successfully."
echo "[AVD] LƯU Ý: đây là AVD trắng, chưa đăng nhập Google Play."
echo "[AVD] Đăng nhập qua noVNC rồi chạy deploy/capture-avd-seed.sh để lần sau khỏi làm lại."
