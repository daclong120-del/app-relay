#!/usr/bin/env bash
#
# Cài vhost app-relay.conf vào nginx của VM đang chạy stack.
#
#   sudo deploy/nginx/install.sh
#
# Chạy lại nhiều lần được: lần nào khác nội dung mới sao lưu, giống hệt thì
# không đụng gì. Luôn `nginx -t` trước khi reload — config sai mà reload thì
# nginx giữ bản cũ, nhưng lần restart sau sẽ không lên được nữa.

set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)/app-relay.conf"
AVAIL=/etc/nginx/sites-available/app-relay
ENABLED=/etc/nginx/sites-enabled/app-relay

[ "$(id -u)" -eq 0 ] || { echo "Cần chạy bằng root (sudo)." >&2; exit 1; }
[ -f "$SRC" ] || { echo "Không thấy $SRC" >&2; exit 1; }
command -v nginx >/dev/null || { echo "Máy này không có nginx." >&2; exit 1; }

if [ -f "$AVAIL" ] && cmp -s "$SRC" "$AVAIL"; then
  echo "Config đã đúng bản trong repo, không đổi gì."
else
  if [ -f "$AVAIL" ]; then
    BAK="${AVAIL}.bak.$(date +%Y%m%d-%H%M%S)"
    cp -a "$AVAIL" "$BAK"
    echo "Đã sao lưu bản cũ → $BAK"
  fi
  install -m 0644 "$SRC" "$AVAIL"
  echo "Đã ghi $AVAIL"
fi

ln -sfn "$AVAIL" "$ENABLED"

nginx -t
systemctl reload nginx
echo "nginx đã reload."

# Tự kiểm luôn, đỡ phải nhớ lệnh curl.
for host in app-relay.lutech.vn apk.bohubo.com; do
  code="$(curl -s -o /dev/null -w '%{http_code}' -H "Host: ${host}" http://127.0.0.1/v1/health || echo 000)"
  printf '  %-24s /v1/health → %s\n' "$host" "$code"
done
code="$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: app-relay.lutech.vn' http://127.0.0.1/internal/v1/jobs/claim || echo 000)"
printf '  %-24s /internal/  → %s (phải là 404)\n' 'app-relay.lutech.vn' "$code"
