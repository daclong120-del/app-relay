#!/usr/bin/env bash
#
# app-relay — dựng toàn bộ stack trên một VPS sạch bằng một lệnh.
#
#   cd /opt/app-relay/deploy
#   DOMAIN=api.tenmien.com CADDY_EMAIL=ban@tenmien.com ./bootstrap.sh
#
# Chưa có tên miền, muốn chạy thử trước — API ra HTTP trần trên cổng 3000:
#
#   ./bootstrap.sh --http-only
#
# Máy đích chỉ cần Docker Engine + Compose plugin. Không cài Node, không cài
# Java, không cài Android SDK, không cần project Supabase Cloud — Postgres và
# PostgREST chạy trong chính compose này.
#
# Script này IDEMPOTENT: chạy lại không ghi đè secret đã sinh, không xoá volume.
# Chạy lại sau khi sửa code = build lại + up lại, dữ liệu giữ nguyên.
#
# Việc DUY NHẤT script không làm được: đăng nhập Google Play trong emulator.
# Đó là thao tác tay qua noVNC, một lần duy nhất — xem phần in ra ở cuối.

set -Eeuo pipefail

cd "$(dirname "$(readlink -f "$0")")"

# ─────────────────────────────────────────────────────────────────────────────
# Tham số
# ─────────────────────────────────────────────────────────────────────────────

DO_BUILD=1
ASSUME_YES=0
HTTP_ONLY=0

while [ $# -gt 0 ]; do
  case "$1" in
    --no-build)             DO_BUILD=0 ;;
    -y|--yes)               ASSUME_YES=1 ;;
    --http-only|--no-tls)   HTTP_ONLY=1 ;;
    -h|--help)
      sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Tham số không hiểu: $1 (dùng --help)" >&2
      exit 2
      ;;
  esac
  shift
done

# ─────────────────────────────────────────────────────────────────────────────
# Tiện ích
# ─────────────────────────────────────────────────────────────────────────────

step()  { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }
ok()    { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn()  { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()   { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

confirm() {
  [ "$ASSUME_YES" = 1 ] && return 0
  [ -t 0 ] || die "$1 (không có TTY để hỏi — chạy lại với --yes nếu chấp nhận)"
  read -r -p "  $1 [y/N] " reply
  [ "$reply" = "y" ] || [ "$reply" = "Y" ]
}

ask() {
  # ask <biến> <câu hỏi> — chỉ hỏi khi biến chưa có giá trị.
  local var="$1" prompt="$2" value
  value="${!var:-}"
  if [ -n "$value" ]; then return 0; fi
  [ -t 0 ] || die "Thiếu biến $var. Đặt sẵn khi gọi: $var=... ./bootstrap.sh"
  while [ -z "$value" ]; do read -r -p "  $prompt: " value; done
  printf -v "$var" '%s' "$value"
}

gen_hex() { openssl rand -hex "$1"; }

b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }

# JWT HS256 mang claim role=service_role. PostgREST xác thực bằng PGRST_JWT_SECRET
# rồi `set role` theo claim, nên đây chính là thứ đóng vai SUPABASE_SECRET_KEY
# khi self-host — supabase-js gửi nó ở cả header apikey lẫn Authorization.
make_service_key() {
  local secret="$1" iat exp header payload signing_input sig
  iat="$(date +%s)"
  exp="$((iat + 315360000))"   # 10 năm
  header='{"alg":"HS256","typ":"JWT"}'
  payload="{\"role\":\"service_role\",\"iss\":\"app-relay-local\",\"iat\":${iat},\"exp\":${exp}}"
  signing_input="$(printf '%s' "$header" | b64url).$(printf '%s' "$payload" | b64url)"
  sig="$(printf '%s' "$signing_input" | openssl dgst -sha256 -hmac "$secret" -binary | b64url)"
  printf '%s.%s' "$signing_input" "$sig"
}

# Ghi file 0600 và chỉ khi chưa tồn tại. Trả 1 nếu bỏ qua vì đã có.
write_new() {
  local path="$1"
  if [ -f "$path" ]; then
    ok "$path đã có — giữ nguyên"
    return 1
  fi
  umask 077
  cat > "$path"
  ok "$path đã sinh"
  return 0
}

env_get() {
  # env_get <file> <KEY> — đọc lại giá trị từ file đã sinh trước đó.
  local file="$1" key="$2"
  [ -f "$file" ] || return 0
  sed -n "s/^${key}=//p" "$file" | tail -n1
}

# ─────────────────────────────────────────────────────────────────────────────
# 1. Kiểm tra máy
# ─────────────────────────────────────────────────────────────────────────────

step "Kiểm tra máy"

command -v docker  >/dev/null 2>&1 || die "Chưa có docker. Cài: curl -fsSL https://get.docker.com | sh"
command -v openssl >/dev/null 2>&1 || die "Chưa có openssl. Cài: apt-get install -y openssl"
docker compose version >/dev/null 2>&1 || die "Thiếu Compose plugin (docker-compose-plugin)"
docker info >/dev/null 2>&1 || die "Không nói chuyện được với Docker daemon. Chạy bằng sudo, hoặc thêm user vào group docker."
ok "docker $(docker version --format '{{.Server.Version}}') + compose $(docker compose version --short)"

ARCH="$(uname -m)"
[ "$ARCH" = "x86_64" ] || die "Cần x86_64. Máy này là $ARCH — system image android-35 x86_64 không chạy được trên ARM."
ok "kiến trúc $ARCH"

# KVM quyết định emulator dùng được thật hay chỉ chạy cho có.
USE_KVM=0
KVM_GID=""
if [ -e /dev/kvm ]; then
  USE_KVM=1
  KVM_GID="$(getent group kvm | cut -d: -f3 || true)"
  [ -n "$KVM_GID" ] || die "/dev/kvm có nhưng không tìm thấy group kvm. Chạy: getent group kvm"
  ok "/dev/kvm sẵn sàng (group kvm gid=$KVM_GID)"
else
  warn "KHÔNG có /dev/kvm — emulator chạy software emulation, chậm tới mức gần như không dùng được thật."
  warn "VPS phải bật nested virtualization mới có /dev/kvm."
  confirm "Vẫn tiếp tục?" || die "Dừng lại. Bật virtualization cho VPS rồi chạy lại."
fi

MEM_GB="$(( $(awk '/MemTotal/{print $2}' /proc/meminfo) / 1024 / 1024 ))"
if [ "$MEM_GB" -lt 8 ]; then
  warn "RAM ${MEM_GB} GB. Emulator xin 3 GB, Android khuyến nghị tổng 16 GB. Dưới 8 GB gần như chắc chắn OOM."
  confirm "Vẫn tiếp tục?" || die "Dừng lại."
else
  ok "RAM ${MEM_GB} GB"
fi

# Đo trên filesystem của Docker, không phải của thư mục repo — hai chỗ này rất
# hay nằm trên hai phân vùng khác nhau, và image 9 GB đáp xuống /var/lib/docker.
DOCKER_ROOT="$(docker info --format '{{.DockerRootDir}}' 2>/dev/null || echo /var/lib/docker)"
DISK_GB="$(( $(df -P "$DOCKER_ROOT" 2>/dev/null | awk 'NR==2{print $4}' || echo 0) / 1024 / 1024 ))"
if [ "$DISK_GB" -lt 60 ]; then
  warn "$DOCKER_ROOT còn trống ${DISK_GB} GB. Riêng worker image đã ~9 GB, AVD userdata 12 GB, chưa tính artifact."
  confirm "Vẫn tiếp tục?" || die "Dừng lại."
else
  ok "đĩa trống ${DISK_GB} GB tại $DOCKER_ROOT"
fi

if command -v ss >/dev/null 2>&1; then
  if [ "$HTTP_ONLY" = 1 ]; then
    NEEDED_PORTS="3000"
    PORT_HINT="API nghe trực tiếp ở cổng 3000 trong chế độ --http-only."
  else
    NEEDED_PORTS="80 443"
    PORT_HINT="Caddy cần cả 80 (thử thách ACME) lẫn 443. Tắt nginx/apache trên host trước."
  fi
  for port in $NEEDED_PORTS; do
    if ss -ltn "sport = :$port" 2>/dev/null | grep -q LISTEN; then
      die "Cổng $port đang bị chiếm. $PORT_HINT"
    fi
  done
  ok "cổng $(echo "$NEEDED_PORTS" | tr ' ' ',') còn trống"
fi

# ─────────────────────────────────────────────────────────────────────────────
# 2. Domain
# ─────────────────────────────────────────────────────────────────────────────

PUBLIC_IP="$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || true)"

if [ "$HTTP_ONLY" = 1 ]; then
  step "Chế độ chạy thử — HTTP trần, KHÔNG có TLS"

  # Vẫn ghi DOMAIN vào .env (giá trị rỗng cũng được) để lúc chuyển sang HTTPS
  # chỉ phải sửa một chỗ.
  DOMAIN="${DOMAIN:-$(env_get .env DOMAIN)}"
  CADDY_EMAIL="${CADDY_EMAIL:-$(env_get .env CADDY_EMAIL)}"

  warn "API sẽ nghe ở http://${PUBLIC_IP:-<IP-VPS>}:3000 — không mã hoá."
  warn "API_TOKEN đi qua Internet dưới dạng chữ đọc được. Ai chen được vào"
  warn "đường truyền đều lấy được token và gọi API thay bạn."
  warn "Dùng để tự kiểm tra. ĐỪNG đưa địa chỉ này cho đối tác thật."
  confirm "Đã hiểu, tiếp tục?" || die "Dừng lại. Chạy không có --http-only để dùng domain + TLS."
else
  step "Domain và TLS"

  DOMAIN="${DOMAIN:-$(env_get .env DOMAIN)}"
  CADDY_EMAIL="${CADDY_EMAIL:-$(env_get .env CADDY_EMAIL)}"

  ask DOMAIN      "Domain trỏ về VPS này (vd: api.tenmien.com)"
  ask CADDY_EMAIL "Email nhận cảnh báo Let's Encrypt"

# Let's Encrypt cấp cert qua HTTP-01: A record phải trỏ đúng IP TRƯỚC khi
# Caddy khởi động, nếu không cert fail và domain trả lỗi TLS.
RESOLVED="$(getent hosts "$DOMAIN" 2>/dev/null | awk 'NR==1{print $1}' || true)"
if [ -n "$PUBLIC_IP" ] && [ -n "$RESOLVED" ] && [ "$PUBLIC_IP" != "$RESOLVED" ]; then
  warn "$DOMAIN đang trỏ $RESOLVED nhưng IP public của máy là $PUBLIC_IP."
  warn "Sai A record thì Let's Encrypt cấp cert THẤT BẠI và domain trả lỗi TLS."
  confirm "Vẫn tiếp tục?" || die "Sửa A record rồi chạy lại."
elif [ -z "$RESOLVED" ]; then
  warn "Không phân giải được $DOMAIN. Nếu DNS vừa đổi thì chờ vài phút."
  confirm "Vẫn tiếp tục?" || die "Dừng lại."
else
  ok "$DOMAIN → $RESOLVED"
fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# 3. Sinh cấu hình
# ─────────────────────────────────────────────────────────────────────────────

step "Sinh cấu hình và secret"

COMPOSE_FILE_LIST="compose.yml"
[ "$USE_KVM" = 1 ] && COMPOSE_FILE_LIST="${COMPOSE_FILE_LIST}:compose.kvm.yaml"
COMPOSE_FILE_LIST="${COMPOSE_FILE_LIST}:compose.supabase.yaml:compose.prod.yaml"

if [ "$HTTP_ONLY" = 1 ]; then
  # compose.http.yaml đổi bind của api từ 127.0.0.1 sang 0.0.0.0. Profile để
  # TRỐNG nên caddy (nằm trong profiles: [production]) không khởi động.
  COMPOSE_FILE_LIST="${COMPOSE_FILE_LIST}:compose.http.yaml"
  COMPOSE_PROFILES_VALUE=""
else
  COMPOSE_PROFILES_VALUE="production"
fi

# deploy/.env chỉ chứa biến compose NỘI SUY (không phải biến ứng dụng).
# COMPOSE_FILE và COMPOSE_PROFILES nằm ở đây là có chủ đích: docker compose đọc
# chúng từ .env của thư mục project, nên sau bootstrap mọi lệnh vận hành chỉ là
# `docker compose ps` / `logs` / `up -d` — không phải nhớ chuỗi -f nào cả.
write_new .env <<EOF || true
# Sinh bởi bootstrap.sh $(date -u +%Y-%m-%dT%H:%M:%SZ) — KHÔNG commit file này.
# Đây là biến cho docker compose nội suy, không phải biến ứng dụng.

COMPOSE_FILE=${COMPOSE_FILE_LIST}
COMPOSE_PROFILES=${COMPOSE_PROFILES_VALUE}

# Chế độ --http-only: DOMAIN để trống, caddy không chạy. Chuyển sang HTTPS thì
# điền DOMAIN + CADDY_EMAIL, bỏ ":compose.http.yaml" khỏi COMPOSE_FILE ở trên,
# đặt COMPOSE_PROFILES=production, rồi \`docker compose up -d\`.
DOMAIN=${DOMAIN}
CADDY_EMAIL=${CADDY_EMAIL}

KVM_GID=${KVM_GID:-108}

# Postgres + PostgREST self-host. JWT_SECRET ký SUPABASE_SECRET_KEY trong .env.api —
# đổi một trong hai mà không đổi cái kia thì API nhận 401 từ PostgREST.
POSTGRES_PASSWORD=$(gen_hex 24)
AUTHENTICATOR_PASSWORD=$(gen_hex 24)
JWT_SECRET=$(gen_hex 32)

# Chỉ dùng khi pull image từ registry. Bootstrap build tại chỗ nên không cần.
DOCKERHUB_USERNAME=apprelay
IMAGE_TAG=latest
EOF

# Đọc lại từ file: lần chạy thứ hai phải dùng đúng secret cũ, không phải secret
# vừa sinh ở heredoc trên.
JWT_SECRET="$(env_get .env JWT_SECRET)"
[ -n "$JWT_SECRET" ] || die ".env có nhưng thiếu JWT_SECRET. Xoá deploy/.env rồi chạy lại (mất DB hiện có)."

# Domain trong .env cũ thắng, để chạy lại không âm thầm đổi domain.
DOMAIN="$(env_get .env DOMAIN)"

SERVICE_KEY="$(make_service_key "$JWT_SECRET")"
WORKER_TOKEN="worker_live_$(gen_hex 24)"
API_TOKEN="apr_live_$(gen_hex 24)"

write_new .env.api <<EOF || true
# Sinh bởi bootstrap.sh $(date -u +%Y-%m-%dT%H:%M:%SZ) — KHÔNG commit file này.
NODE_ENV=production
PORT=3000

# Token cho /v1/* — đây là thứ đưa cho bên gọi API.
API_TOKEN=${API_TOKEN}
# Token cho /internal/v1/* — phải TRÙNG TUYỆT ĐỐI với .env.worker.
WORKER_TOKEN=${WORKER_TOKEN}

# Supabase self-host trong chính compose này. Gateway nginx dựng lại đúng hình
# dạng URL /rest/v1 mà supabase-js mong đợi.
SUPABASE_URL=http://supabase:8000
SUPABASE_SECRET_KEY=${SERVICE_KEY}

DOWNLOAD_SIGNING_SECRET=$(gen_hex 32)
DOWNLOAD_URL_TTL_SECONDS=600

ARTIFACT_DIR=/data/artifacts
# APK nặng nên hết hạn sớm; phần nhẹ (listing, ảnh, metadata) giữ 30 ngày.
APK_TTL_HOURS=6
ARTIFACT_TTL_HOURS=720
ARTIFACT_MIN_FREE_BYTES=10737418240
ORPHAN_DIR_MIN_AGE_MINUTES=120
DELETE_AFTER_DOWNLOAD_GRACE_MINUTES=10
# Phải cao hơn hẳn lease 120 giây, nếu không reaper cướp job còn sống.
STUCK_JOB_GRACE_MINUTES=15
EOF

# Worker phải dùng lại token của .env.api hiện hành, kể cả khi .env.api là file cũ.
WORKER_TOKEN="$(env_get .env.api WORKER_TOKEN)"
[ -n "$WORKER_TOKEN" ] || die ".env.api thiếu WORKER_TOKEN — sửa tay rồi chạy lại."

write_new .env.worker <<EOF || true
# Sinh bởi bootstrap.sh $(date -u +%Y-%m-%dT%H:%M:%SZ) — KHÔNG commit file này.
WORKER_ID=worker_vps_01
WORKER_NAME=VPS Worker 01

# Đi thẳng qua mạng nội bộ Docker, không vòng ra domain public.
RELAY_API_URL=http://api:3000/internal/v1
WORKER_TOKEN=${WORKER_TOKEN}

JAVA_HOME=/opt/java/openjdk
ANDROID_SDK_ROOT=/opt/android-sdk
ANDROID_AVD_HOME=/home/worker/.android/avd
ADB_PATH=/opt/android-sdk/platform-tools/adb
EMULATOR_PATH=/opt/android-sdk/emulator/emulator

ANDROID_AVD=chpay
WORK_DIR=/app/apps/worker/work

EMULATOR_ACCEL=$([ "$USE_KVM" = 1 ] && echo on || echo off)
EMULATOR_BOOT_TIMEOUT=$([ "$USE_KVM" = 1 ] && echo 600 || echo 1800)

# pixel_6 mặc định chỉ ~2G userdata, đầy ngay khi Play Store cache và vài trăm
# MB APK đáp xuống.
AVD_RAM_MB=3072
AVD_HEAP_MB=512
AVD_DATA_SIZE=12G
AVD_SDCARD_SIZE=2G

POLL_INTERVAL_MS=5000
HEARTBEAT_INTERVAL_MS=20000
EOF

chmod 600 .env .env.api .env.worker

# Kiểm tra chéo: lệch token là lỗi im lặng nhất trong hệ này — worker online,
# heartbeat chạy, nhưng mọi lần claim job đều 403 và không job nào được nhận.
if [ "$(env_get .env.api WORKER_TOKEN)" != "$(env_get .env.worker WORKER_TOKEN)" ]; then
  die "WORKER_TOKEN trong .env.api và .env.worker KHÔNG khớp. Sửa cho trùng rồi chạy lại."
fi
ok "WORKER_TOKEN khớp giữa api và worker"

docker compose config >/dev/null || die "docker compose config lỗi — xem output ở trên."
ok "compose hợp lệ ($(echo "$COMPOSE_FILE_LIST" | tr ':' ' '), profile production)"

# ─────────────────────────────────────────────────────────────────────────────
# 4. Build
# ─────────────────────────────────────────────────────────────────────────────

if [ "$DO_BUILD" = 1 ]; then
  step "Build image (worker mất ~30 phút lần đầu: JDK + Android SDK + system image)"
  docker compose build
  ok "build xong"
else
  step "Bỏ qua build (--no-build)"
fi

# ─────────────────────────────────────────────────────────────────────────────
# 5. Khởi động
# ─────────────────────────────────────────────────────────────────────────────

step "Khởi động stack"
docker compose up -d --remove-orphans

wait_healthy() {
  local svc="$1" timeout="$2" elapsed=0 cid status
  printf '  chờ %s healthy' "$svc"
  while [ "$elapsed" -lt "$timeout" ]; do
    cid="$(docker compose ps -q "$svc" 2>/dev/null || true)"
    if [ -n "$cid" ]; then
      status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$cid" 2>/dev/null || echo starting)"
      case "$status" in
        healthy) printf '\n'; ok "$svc healthy"; return 0 ;;
        none)    printf '\n'; ok "$svc đang chạy (không có healthcheck)"; return 0 ;;
      esac
    fi
    printf '.'
    sleep 5
    elapsed=$((elapsed + 5))
  done
  printf '\n'
  return 1
}

wait_healthy supabase 120 || die "Gateway Supabase không healthy. Xem: docker compose logs supabase rest db"
wait_healthy api 180 || {
  docker compose logs --tail 40 api
  die "API không healthy. Log ở trên. Hay gặp nhất: sai SUPABASE_SECRET_KEY hoặc thiếu biến bắt buộc trong .env.api."
}

# ─────────────────────────────────────────────────────────────────────────────
# 6. Smoke test
# ─────────────────────────────────────────────────────────────────────────────

step "Smoke test"

# Qua chính container để không phụ thuộc curl/wget có trên host hay không.
docker compose exec -T api wget -qO- http://127.0.0.1:3000/v1/health >/dev/null \
  || die "/v1/health trong container không trả lời."
ok "/v1/health trong container: OK"

API_TOKEN="$(env_get .env.api API_TOKEN)"
if docker compose exec -T api wget -qO- --header="Authorization: Bearer ${API_TOKEN}" \
     http://127.0.0.1:3000/v1/system/status >/dev/null 2>&1; then
  ok "/v1/system/status với API_TOKEN: OK (database nối được)"
else
  warn "/v1/system/status lỗi — API sống nhưng có thể chưa đọc được database. Xem: docker compose logs api"
fi

# Kiểm tra từ ngoài.
if [ "$HTTP_ONLY" = 1 ]; then
  BASE_URL="http://${PUBLIC_IP:-127.0.0.1}:3000"
  # Gọi qua IP public chứ không phải 127.0.0.1: mục đích là xác nhận gói tin đi
  # được từ Internet vào, tức là security group / firewall đã mở cổng 3000.
  if command -v curl >/dev/null 2>&1 && [ -n "$PUBLIC_IP" ]; then
    if curl -fsS --max-time 8 "http://${PUBLIC_IP}:3000/v1/health" >/dev/null 2>&1; then
      ok "${BASE_URL}/v1/health trả lời từ IP public — API đã ra được Internet"
    else
      warn "Không gọi được ${BASE_URL}/v1/health từ IP public."
      warn "Container thì sống (test bên trên đã qua), nên gần như chắc chắn là"
      warn "FIREWALL chặn cổng 3000 — trên FPT Cloud là Security Group của VM."
      warn "Kiểm tra thêm: ufw status  (nếu bật thì: ufw allow 3000/tcp)"
    fi
  else
    warn "Bỏ qua kiểm tra từ ngoài (thiếu curl hoặc không lấy được IP public)."
  fi
else
  BASE_URL="https://${DOMAIN}"
  # Cert Let's Encrypt cần vài chục giây sau khi Caddy lên.
  if command -v curl >/dev/null 2>&1; then
    printf '  chờ cert TLS cho %s' "$DOMAIN"
    PUBLIC_OK=0
    for _ in $(seq 1 24); do
      if curl -fsS --max-time 5 "https://${DOMAIN}/v1/health" >/dev/null 2>&1; then
        PUBLIC_OK=1; break
      fi
      printf '.'
      sleep 5
    done
    printf '\n'
    if [ "$PUBLIC_OK" = 1 ]; then
      ok "https://${DOMAIN}/v1/health trả lời — API đã public"
    else
      warn "Chưa gọi được https://${DOMAIN}/v1/health."
      warn "Thường là A record chưa trỏ đúng, hoặc firewall chặn 80/443 (ACME cần CẢ HAI)."
      warn "Xem log cấp cert: docker compose logs caddy | tail -50"
    fi
  else
    warn "Host không có curl — bỏ qua kiểm tra HTTPS từ ngoài. Tự thử: curl https://${DOMAIN}/v1/health"
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# 7. Tổng kết
# ─────────────────────────────────────────────────────────────────────────────

# Dựng sẵn thành biến thay vì nhét heredoc lồng vào heredoc: heredoc trong
# heredoc mà đặt nháy sai một chỗ là mã màu in ra thành chữ.
HTTPS_NOTE=""
if [ "$HTTP_ONLY" = 1 ]; then
  HTTPS_NOTE="$(printf '\n\033[1;33m═══ Khi có domain, bật HTTPS ═══\033[0m\n')
  Sửa deploy/.env — ba dòng:

    DOMAIN=api.tenmien.com
    CADDY_EMAIL=ban@tenmien.com
    COMPOSE_PROFILES=production

  rồi bỏ \":compose.http.yaml\" ở cuối dòng COMPOSE_FILE, và chạy:

    docker compose up -d

  Caddy tự xin cert. Không phải build lại, không mất dữ liệu.
  Nhớ đóng cổng 3000 trên firewall sau đó — API đã đi qua 443 rồi.
"
fi

cat <<EOF

$(printf '\033[1;32m═══ Stack đã chạy ═══\033[0m')

  API            ${BASE_URL}$([ "$HTTP_ONLY" = 1 ] && printf '   (HTTP TRẦN — chỉ để tự test)')
  API_TOKEN      $(env_get .env.api API_TOKEN)

  Thử ngay:
    curl ${BASE_URL}/v1/health
    curl -H "Authorization: Bearer \$API_TOKEN" ${BASE_URL}/v1/system/status

  Vận hành — đứng trong $(pwd), KHÔNG cần cờ -f nào (đã ghi trong .env):
    docker compose ps
    docker compose logs -f api
    docker compose up -d --build api     # deploy lại sau khi sửa code

$(printf '\033[1;33m═══ Còn MỘT bước tay: đăng nhập Google Play ═══\033[0m')

  Worker đang boot emulator (5–10 phút lần đầu: tạo AVD 12G rồi boot Android).
  Emulator chưa đăng nhập CH Play thì job nào cũng fail ở bước tải app.

  Từ máy cá nhân:
    ssh -N -L 6080:127.0.0.1:6080 $(whoami)@${PUBLIC_IP:-<IP-VPS>}

  Rồi mở (phải có autoconnect=true, nếu không noVNC đứng ở màn hình chờ):
    http://localhost:6080/vnc.html?autoconnect=true&resize=scale

  Đăng nhập Google trong app Play Store. Xong thì đóng trình duyệt, ngắt SSH.
  Phiên đăng nhập nằm trong volume worker-avd — chỉ làm MỘT LẦN, restart vẫn còn.

  Theo dõi emulator boot:
    docker compose exec worker bash -c 'tail -f /tmp/worker-node-stdout*.log'

${HTTPS_NOTE}
$(printf '\033[1;31m═══ Không bao giờ chạy ═══\033[0m')

    docker compose down -v      # -v xoá volume → mất AVD và phiên CH Play

EOF
