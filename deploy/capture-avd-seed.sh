#!/usr/bin/env bash
#
# Chụp lại AVD đã đăng nhập Google Play thành một seed để nướng vào image.
#
# Chạy MỘT LẦN trên máy đã đăng nhập xong. Kết quả rơi vào
# avd-seed/avd-seed.tar.gz ở gốc repo, và Dockerfile COPY nguyên thư mục đó vào
# image. Từ đó `docker pull` ở máy nào cũng có sẵn phiên đăng nhập —
# create-avd.sh thấy seed thì bung ra thay vì tạo AVD trắng.
#
#   ./capture-avd-seed.sh
#
# ---------------------------------------------------------------------------
# BA ĐIỀU PHẢI BIẾT TRƯỚC KHI CHẠY
# ---------------------------------------------------------------------------
#
# 1. SEED LÀ THÔNG TIN ĐĂNG NHẬP GOOGLE. Nướng vào image nghĩa là ai pull được
#    image là đăng nhập được vào tài khoản đó. Repo Docker Hub PHẢI để private.
#    File seed cũng đã bị .gitignore chặn — đừng ép commit nó lên git.
#
# 2. KHÔNG chạy hai bản clone cùng lúc. Clone giữ nguyên android_id và GSF ID,
#    với Google đó là CÙNG một thiết bị đang ở hai nơi — nó sẽ huỷ phiên một
#    bên rồi bắt xác minh lại. Cách này để CHUYỂN MÁY, không phải để nhân bản
#    đội worker. Nhiều worker thì mỗi con một tài khoản, một seed riêng.
#
# 3. Emulator phải tắt SẠCH trước khi chụp. Đang chạy thì qcow2 ghi dở, tar ra
#    file hỏng mà lúc bung KHÔNG báo lỗi gì — Android vẫn boot, chỉ là mất
#    account. Script tự lo việc này, đừng tự tar bằng tay khi worker đang chạy.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SEED_DIR="${REPO_ROOT}/avd-seed"
SEED_NAME="avd-seed.tar.gz"

# Docker Desktop trên Git Bash: MSYS tự dịch mọi thứ trông giống đường dẫn Unix
# trong tham số, biến "/avd" thành "C:/Program Files/Git/avd". Tắt đi, rồi tự
# đổi phía host sang dạng Windows bằng cygpath.
export MSYS_NO_PATHCONV=1
host_path() {
    if command -v cygpath > /dev/null 2>&1; then
        cygpath -w "$1"
    else
        printf '%s' "$1"
    fi
}

cd "${SCRIPT_DIR}"

echo "==> Tìm container worker..."
CID="$(docker compose ps -q worker || true)"
if [ -z "${CID}" ]; then
    echo "LỖI: không thấy container worker. Chạy 'docker compose up -d' trước." >&2
    exit 1
fi

# Lấy tên volume từ chính container thay vì đoán "<project>_worker-avd": tên
# project đổi theo thư mục hoặc theo COMPOSE_PROJECT_NAME, đoán là hỏng.
VOLUME="$(docker inspect "${CID}" \
    --format '{{range .Mounts}}{{if eq .Destination "/home/worker/.android"}}{{.Name}}{{end}}{{end}}')"
if [ -z "${VOLUME}" ]; then
    echo "LỖI: container worker không mount volume nào vào /home/worker/.android." >&2
    exit 1
fi
echo "    container = ${CID:0:12}"
echo "    volume    = ${VOLUME}"

# --- Kiểm tra có tài khoản thật không, TRƯỚC khi tắt máy -------------------
#
# Chụp một AVD chưa đăng nhập rồi nướng vào image là kiểu hỏng tốn thời gian
# nhất: build 10 GB, đẩy lên registry, deploy, rồi mới phát hiện Play Store vẫn
# hỏi mật khẩu. Chặn ngay ở đây.
echo "==> Kiểm tra tài khoản Google trên emulator..."
ACCOUNTS="$(docker exec "${CID}" sh -lc \
    'adb shell dumpsys account 2>/dev/null | grep -o "name=[^,]*, type=com.google" || true')"
if [ -z "${ACCOUNTS}" ]; then
    echo "LỖI: emulator chưa đăng nhập tài khoản Google nào." >&2
    echo "     Bật GUI (WORKER_GUI=on trong deploy/.env.worker), vào noVNC ở" >&2
    echo "     http://127.0.0.1:6080 đăng nhập Play Store, rồi chạy lại script này." >&2
    exit 1
fi
echo "    ${ACCOUNTS}"

ANDROID_ID="$(docker exec "${CID}" sh -lc 'adb shell settings get secure android_id 2>/dev/null' | tr -d '\r\n')"
echo "    android_id = ${ANDROID_ID}"

# --- Tắt sạch -------------------------------------------------------------
#
# `adb emu kill` TRƯỚC, rồi mới stop container. Không đi tắt bằng mỗi
# `docker compose stop` được:
#
#   - stop_grace_period: 120s chỉ có trong compose.prod.yaml, mà overlay đó
#     không phải lúc nào cũng nằm trong COMPOSE_FILE. Thiếu nó thì compose
#     SIGKILL sau ĐÚNG 10 GIÂY — quá ngắn để emulator ghi xong userdata, và cái
#     hỏng ra là seed mất account chứ không phải lỗi báo ra màn hình.
#   - SIGTERM vào container là bắn vào supervisord, không phải vào emulator;
#     supervisord đá lại xuống tiến trình con nhưng không chờ QEMU flush xong.
#
# `adb emu kill` gọi thẳng vào console của emulator, nó tự đóng đĩa theo đúng
# quy trình. Chờ nó biến mất khỏi `adb devices` rồi mới stop là chắc chắn sạch.
echo "==> Tắt emulator sạch (adb emu kill)..."
# -e HOME=/home/worker là BẮT BUỘC, không phải cho gọn. Console của emulator đòi
# xác thực bằng token trong ~/.emulator_console_auth_token, mà emulator chạy dưới
# HOME=/home/worker nên token nằm ở đó. `docker exec` mặc định vào với HOME=/root
# → adb không thấy token → console trả về "KO: unknown command" cho MỌI lệnh, kể
# cả `kill`. Triệu chứng đánh lừa: trông như adb không hỗ trợ lệnh, thật ra là
# chưa đăng nhập được vào console.
KILL_OUT="$(docker exec -e HOME=/home/worker "${CID}" sh -lc 'adb emu kill 2>&1' || true)"
[ -n "${KILL_OUT}" ] && echo "    adb: ${KILL_OUT}"

# Chờ tiến trình QEMU chết, KHÔNG chờ adb devices vắng mặt. adb server giữ lại
# entry của emulator đã chết một lúc lâu (có khi ở trạng thái offline), nên soi
# `adb devices` là chờ nhầm thứ: hết 120 giây mà vẫn thấy tên máy, trong khi
# đĩa đã đóng xong từ lâu. pgrep vào qemu-system là câu hỏi đúng — còn tiến
# trình nghĩa là còn có thể đang ghi.
echo -n "    chờ QEMU đóng đĩa"
EMU_DOWN=0
for _ in $(seq 1 60); do
    if ! docker exec "${CID}" sh -lc 'pgrep -f qemu-system > /dev/null 2>&1'; then
        EMU_DOWN=1
        echo " — xong."
        break
    fi
    echo -n "."
    sleep 2
done

if [ "${EMU_DOWN}" != "1" ]; then
    echo ""
    echo "    CẢNH BÁO: QEMU còn sống sau 120s, 'adb emu kill' có vẻ không ăn." >&2
    echo "    Vẫn chạy tiếp — 'docker compose stop -t 120' bên dưới cho nó thêm" >&2
    echo "    120s để tự tắt tử tế. Nhưng nếu seed bung ra mà mất tài khoản thì" >&2
    echo "    đây là chỗ đầu tiên cần soi." >&2
fi

# -t 120 đặt thẳng ở đây thay vì trông vào stop_grace_period của overlay: kể cả
# khi vòng chờ trên hết giờ mà emulator còn sống, nó vẫn có thêm 120s tử tế.
echo "==> Tắt container worker..."
docker compose stop -t 120 worker

echo "==> Đóng gói seed..."
mkdir -p "${SEED_DIR}"

# Bỏ ra ngoài, theo thứ tự lý do:
#   sdcard.img       — 13 GB toàn số 0, phiên đăng nhập không nằm ở đó
#                      (sdcard.img.qcow2 chỉ ~580 KB tức gần như chưa ghi gì).
#                      create-avd.sh dựng lại bằng mksdcard lúc bung.
#   *.lock           — khoá của tiến trình đã chết. Mang sang máy mới thì
#                      emulator tưởng có bản khác đang chạy và từ chối khởi động.
#   hardware-qemu.ini, emu-launch-params.txt — sinh lại mỗi lần launch từ
#                      config.ini; bản cũ còn ghi tham số của máy cũ.
#   snapshots/       — QuickBoot snapshot. Entrypoint chạy -no-snapshot-save nên
#                      nó rỗng, mà snapshot RAM cũ lệch phần cứng máy mới thì
#                      còn tệ hơn boot lạnh.
#   tmpAdbCmds/      — rác tạm.
#   running/         — sổ đăng ký các emulator ĐANG chạy (pid_NN.ini + jwks).
#                      Nó là anh em của chpay.avd/ chứ không nằm trong đó, nên
#                      mấy pattern `avd/*/...` ở trên KHÔNG bắt được — bản chụp
#                      đầu tiên đã lọt pid_24.ini của tiến trình vừa chết vào
#                      seed. Mang PID máy cũ sang máy mới là mời công cụ đi tìm
#                      một emulator không tồn tại.
#
# PHẢI gói kèm adbkey/adbkey.pub, không chỉ mỗi thư mục avd/. Đây là thứ bản
# seed đầu tiên thiếu và nó làm deploy hỏng hoàn toàn:
#
#   /data/misc/adb/adb_keys bên trong seed là danh sách khoá adb được phép của
#   MÁY CŨ. Máy mới dựng volume trắng thì adb tự sinh khoá MỚI ở
#   ~/.android/adbkey, khoá đó không có trong danh sách → mọi lệnh adb trả về
#   "device unauthorized" → worker không điều khiển được emulator.
#
#   System image google_apis_playstore là user build, ro.adb.secure=1 nên adb
#   bắt buộc xác thực (bản google_apis thường thì không — nên lỗi này chỉ lộ ra
#   đúng ở cấu hình đang dùng). Cũng không chữa tay được: hộp thoại "Allow USB
#   debugging" cần màn hình, mà VPS chạy WORKER_GUI=off.
#
# Danh sách file dựng động trong container: `[ -f ... ] && set --` để thiếu file
# thì bỏ qua thay vì làm tar chết.
docker run --rm \
    -v "${VOLUME}:/avd:ro" \
    -v "$(host_path "${SEED_DIR}"):/out" \
    -e "SEED_NAME=${SEED_NAME}" \
    alpine:latest \
    sh -c 'cd /avd
           set -- avd
           [ -f adbkey ]     && set -- "$@" adbkey
           [ -f adbkey.pub ] && set -- "$@" adbkey.pub
           exec tar czf "/out/${SEED_NAME}" \
               --exclude=avd/running \
               --exclude="avd/*/sdcard.img" \
               --exclude="avd/*/sdcard.img.qcow2" \
               --exclude="avd/*/*.lock" \
               --exclude="avd/*/hardware-qemu.ini" \
               --exclude="avd/*/emu-launch-params.txt" \
               --exclude=avd/*/snapshots \
               --exclude=avd/*/tmpAdbCmds \
               "$@"'

echo "==> Bật lại worker..."
docker compose up -d worker

SEED_SIZE="$(du -h "${SEED_DIR}/${SEED_NAME}" | cut -f1)"
cat <<EOF

==============================================================
Seed đã tạo: avd-seed/${SEED_NAME}  (${SEED_SIZE})
  tài khoản  : ${ACCOUNTS}
  android_id : ${ANDROID_ID}

Kích thước gần như toàn bộ là userdata-qemu.img.qcow2. Android mã hoá
partition đó (FBE), nên dữ liệu đã ngẫu nhiên hoá — không compressor nào
nén thêm được. ~2.5 GB là sàn, không phải chỗ để tối ưu.

Bước tiếp:
  1. Build lại image worker:
       docker compose build worker
  2. Đẩy lên registry PRIVATE:
       docker compose push worker
  3. Máy mới: docker compose up -d  → có sẵn phiên đăng nhập, khỏi login.

NHẮC LẠI: image bây giờ chứa thông tin đăng nhập Google. Giữ repo private.
==============================================================
EOF
