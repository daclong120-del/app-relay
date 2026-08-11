#!/usr/bin/env bash
#
# Bật / tắt màn hình emulator. Chỉ làm đúng một việc này.
#
#   ./gui.sh          xem đang bật hay tắt
#   ./gui.sh on       bật — để đăng nhập Google Play hoặc nhìn lúc gỡ lỗi
#   ./gui.sh off      tắt — cho nhẹ CPU khi chạy bình thường
#
# TẮT GUI KHÔNG LÀM MẤT PHIÊN ĐĂNG NHẬP GOOGLE PLAY.
# Phiên đó nằm trong volume worker-avd, không liên quan gì tới màn hình.
# Cần đăng nhập lại lúc nào thì cứ `./gui.sh on`, xong lại `./gui.sh off`.
#
# Script này KHÔNG đụng tới secret, KHÔNG build, KHÔNG xoá gì. Chạy sai cùng
# lắm là phải chạy lại lệnh kia.

set -Eeuo pipefail

cd "$(dirname "$(readlink -f "$0")")"

ENV_FILE=".env.worker"

ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[ -f "$ENV_FILE" ] || die "Không thấy $ENV_FILE. Đứng trong thư mục deploy/ và chạy bootstrap.sh trước."

current() { sed -n 's/^WORKER_GUI=//p' "$ENV_FILE" | tail -n1; }

CUR="$(current)"
[ -n "$CUR" ] || CUR="on"   # thiếu dòng này thì Dockerfile mặc định là on

# ── xem trạng thái ───────────────────────────────────────────────────────────

if [ $# -eq 0 ] || [ "${1:-}" = "status" ]; then
  printf '\n  WORKER_GUI = \033[1m%s\033[0m\n\n' "$CUR"
  if [ "$CUR" = "on" ]; then
    echo "  Đang BẬT — xem được màn hình emulator, tốn CPU hơn."
    echo "  Tắt đi:  ./gui.sh off"
  else
    echo "  Đang TẮT — emulator chạy không cửa sổ, nhẹ CPU."
    echo "  Bật lại: ./gui.sh on"
  fi
  echo
  exit 0
fi

TARGET="$1"
case "$TARGET" in
  on|off) ;;
  *) die "Chỉ nhận: on | off | status  (bạn gõ: $TARGET)" ;;
esac

# ── kiểm tra image có hiểu công tắc này không ─────────────────────────────────

# Image build trước khi tính năng này tồn tại sẽ bỏ qua WORKER_GUI hoàn toàn —
# đổi xong không thấy gì khác và rất dễ tưởng script hỏng. Bắt lỗi ngay.
if docker compose ps -q worker >/dev/null 2>&1 && [ -n "$(docker compose ps -q worker 2>/dev/null)" ]; then
  if ! docker compose exec -T worker grep -q 'WORKER_GUI' /app/apps/worker/docker/entrypoint.sh 2>/dev/null; then
    die "Image worker đang chạy được build TRƯỚC khi có công tắc này, nên đổi cũng vô ích.
   Cập nhật rồi build lại (khoảng 2-3 phút, Docker còn cache Android SDK):

     cd .. && git pull && cd deploy
     docker compose build worker && docker compose up -d worker

   Xong rồi chạy lại: ./gui.sh $TARGET"
  fi
fi

# ── đổi ──────────────────────────────────────────────────────────────────────

if [ "$CUR" = "$TARGET" ]; then
  ok "WORKER_GUI đã là '$TARGET' rồi, không cần đổi gì."
  exit 0
fi

if grep -q '^WORKER_GUI=' "$ENV_FILE"; then
  sed -i "s/^WORKER_GUI=.*/WORKER_GUI=${TARGET}/" "$ENV_FILE"
else
  printf '\nWORKER_GUI=%s\n' "$TARGET" >> "$ENV_FILE"
fi
ok "$ENV_FILE: WORKER_GUI=$TARGET"

echo "  Dựng lại container worker..."
docker compose up -d worker
ok "worker đã khởi động lại"

# ── in việc cần làm tiếp ─────────────────────────────────────────────────────

PUBLIC_IP="$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || true)"

if [ "$TARGET" = "on" ]; then
  cat <<EOF

$(printf '\033[1;32m═══ GUI đã BẬT ═══\033[0m')

  Emulator cần vài phút để boot lại. Theo dõi:
    docker compose exec worker adb shell getprop sys.boot_completed   # ra 1 là xong

  Từ máy cá nhân, mở đường hầm:
    ssh -N -L 6080:127.0.0.1:6080 $(whoami)@${PUBLIC_IP:-<IP-VPS>}

  Rồi mở trình duyệt (phải có autoconnect=true):
    http://localhost:6080/vnc.html?autoconnect=true&resize=scale

  Xong việc thì nhớ tắt lại cho nhẹ máy:
    ./gui.sh off

EOF
else
  cat <<EOF

$(printf '\033[1;32m═══ GUI đã TẮT ═══\033[0m')

  Emulator chạy không cửa sổ. Worker vẫn nhận job và kéo APK bình thường,
  chỉ là không xem được màn hình qua noVNC nữa.

  Phiên đăng nhập Google Play KHÔNG mất — nó nằm trong volume worker-avd.
  Cần nhìn lại lúc nào thì: ./gui.sh on

  Kiểm tra worker vẫn sống:
    docker compose exec worker adb devices
    docker compose logs --tail 20 worker

EOF
fi
