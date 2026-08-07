#!/bin/bash
#
# Dung lai toan bo app-relay tren WSL Ubuntu 24.04:
#   Android SDK + AVD nhe (Android 13) -> dashboard (docker) -> worker (pm2)
#
# Chay:  bash setup-wsl.sh
#
# Script idempotent — chay lai nhieu lan khong hong gi. Cac buoc can quyen root
# dung sudo; neu chay trong phien khong nhap duoc mat khau thi thay bang:
#   wsl -d Ubuntu-24.04 -u root -- bash /mnt/d/.../setup-wsl.sh
#
# CAN LAM TAY 1 LAN (script khong tu lam duoc):
#   - Dang nhap Google account vao Play Store tren emulator. Khong co account
#     thi Play Store khong cai duoc app va pipeline dung o buoc installing_app.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

ANDROID_HOME="${ANDROID_HOME:-$HOME/android-sdk}"
AVD_NAME="${AVD_NAME:-chpay}"
SYSTEM_IMAGE="system-images;android-33;google_apis_playstore;x86_64"
CMDLINE_TOOLS_ZIP="commandlinetools-linux-15859902_latest.zip"
DASHBOARD_PORT=3001

log()  { echo -e "\n\033[1;34m==> $*\033[0m"; }
ok()   { echo -e "  \033[0;32m✓\033[0m $*"; }
warn() { echo -e "  \033[0;33m!\033[0m $*"; }
die()  { echo -e "\n\033[0;31m✗ $*\033[0m" >&2; exit 1; }

# ─────────────────────────────────────────────────────────────────────────
log "1/8 Kiem tra moi truong WSL"
grep -qi microsoft /proc/version || die "Script nay chi chay trong WSL."
[ -e /dev/kvm ] || die "/dev/kvm khong ton tai. Bat nested virtualization cho WSL truoc."
ok "WSL + /dev/kvm san sang"

# ─────────────────────────────────────────────────────────────────────────
log "2/8 Quyen /dev/kvm"
# udev chi chay khi systemd=true; them ca lenh o [boot] de chac chan.
sudo groupadd -f kvm
sudo usermod -aG kvm "$USER"
sudo chown root:kvm /dev/kvm
sudo chmod 660 /dev/kvm
echo 'KERNEL=="kvm", GROUP="kvm", MODE="0660"' | sudo tee /etc/udev/rules.d/99-kvm.rules >/dev/null

if ! sudo grep -q '^command' /etc/wsl.conf 2>/dev/null; then
  if sudo grep -q '^\[boot\]' /etc/wsl.conf 2>/dev/null; then
    sudo sed -i '/^\[boot\]/a command = /bin/sh -c "chown root:kvm /dev/kvm; chmod 660 /dev/kvm"' /etc/wsl.conf
  else
    printf '\n[boot]\ncommand = /bin/sh -c "chown root:kvm /dev/kvm; chmod 660 /dev/kvm"\n' | sudo tee -a /etc/wsl.conf >/dev/null
  fi
fi
ok "quyen KVM da set (co hieu luc sau khi mo phien moi)"

# ─────────────────────────────────────────────────────────────────────────
log "3/8 Goi he thong"
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -y -qq
# Nhom xcb/xkb la bat buoc: thieu chung thi emulator chay nhung KHONG dung
# duoc cua so Qt (loi 'libxkbfile.so.1: cannot open shared object file').
sudo apt-get install -y -qq --no-install-recommends \
  openjdk-17-jdk-headless unzip wget curl ca-certificates cpu-checker \
  docker.io docker-compose-v2 \
  libpulse0 libnss3 libxcursor1 libxcomposite1 libxdamage1 \
  libxrandr2 libxi6 libxtst6 libasound2t64 libglu1-mesa \
  libxkbfile1 libice6 libsm6 libxkbcommon-x11-0 \
  libxcb-cursor0 libxcb-icccm4 libxcb-image0 libxcb-keysyms1 \
  libxcb-render-util0 libxcb-shape0 libxcb-xkb1 libxcb-util1 \
  libxcb-randr0 libxcb-xinerama0 libxcb-xfixes0
ok "$(java -version 2>&1 | head -1)"

# ─────────────────────────────────────────────────────────────────────────
log "4/8 Node 20 (ban Linux)"
# WSL ke thua PATH cua Windows nen 'npm' co the tro ve C:\Program Files\nodejs.
# Phai cai Node native, neu khong build se loi rat kho hieu.
if ! command -v node >/dev/null || [[ "$(command -v node)" != /usr/bin/node ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - >/dev/null
  sudo apt-get install -y -qq nodejs
fi
ok "node $(node -v) tai $(command -v node)"

command -v pm2 >/dev/null || sudo npm i -g pm2 --silent
ok "pm2 $(pm2 --version 2>/dev/null | tail -1)"

sudo usermod -aG docker "$USER" || true
sudo service docker start >/dev/null 2>&1 || true
ok "docker da bat"

# ─────────────────────────────────────────────────────────────────────────
log "5/8 Android SDK"
if [ ! -x "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" ]; then
  mkdir -p "$ANDROID_HOME/cmdline-tools"
  tmp=$(mktemp -d)
  curl -fsSL -o "$tmp/cli.zip" "https://dl.google.com/android/repository/$CMDLINE_TOOLS_ZIP"
  unzip -q -o "$tmp/cli.zip" -d "$tmp"
  rm -rf "$ANDROID_HOME/cmdline-tools/latest"
  mv "$tmp/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
  rm -rf "$tmp"
fi

export ANDROID_SDK_ROOT="$ANDROID_HOME"
SDKM="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
yes 2>/dev/null | "$SDKM" --licenses >/dev/null 2>&1 || true
# Chi cai dung 3 goi. Khong can platforms/build-tools vi pipeline chi keo APK,
# khong bien dich gi — bo di tiet kiem vai GB.
"$SDKM" --install "platform-tools" "emulator" "$SYSTEM_IMAGE" >/dev/null
ok "platform-tools + emulator + $SYSTEM_IMAGE"

if ! grep -q 'ANDROID_HOME' ~/.bashrc; then
  cat >> ~/.bashrc <<BRC

# === Android SDK (app-relay) ===
export ANDROID_HOME=\$HOME/android-sdk
export ANDROID_SDK_ROOT=\$ANDROID_HOME
export PATH=\$ANDROID_HOME/cmdline-tools/latest/bin:\$ANDROID_HOME/platform-tools:\$ANDROID_HOME/emulator:\$PATH
BRC
fi

# ─────────────────────────────────────────────────────────────────────────
log "6/8 AVD '$AVD_NAME'"
CFG="$HOME/.android/avd/$AVD_NAME.avd/config.ini"
if [ ! -f "$CFG" ]; then
  # pixel_6 = 1080x2400, dung bang AVD cu tren Windows nen toa do tap trong
  # play-ui-automator.ts van dung.
  echo "no" | "$ANDROID_HOME/cmdline-tools/latest/bin/avdmanager" \
    create avd -n "$AVD_NAME" -d pixel_6 -k "$SYSTEM_IMAGE" --force >/dev/null
fi

setkey() {
  if grep -q "^$1=" "$CFG"; then sed -i "s|^$1=.*|$1=$2|" "$CFG"; else echo "$1=$2" >> "$CFG"; fi
}
# hw.gpu.enabled mac dinh la 'no' -> emulator chay nhung khong dung duoc cua so.
# WSL khong co /dev/dri nen phai render bang phan mem.
setkey "hw.gpu.enabled"   "yes"
setkey "hw.gpu.mode"      "swiftshader_indirect"
setkey "PlayStore.enabled" "yes"
setkey "hw.ramSize"       "2048"
setkey "vm.heapSize"      "256"
setkey "disk.dataPartition.size" "6144M"
setkey "hw.audioInput"    "no"
setkey "hw.audioOutput"   "no"
setkey "hw.camera.back"   "none"
setkey "hw.camera.front"  "none"
setkey "hw.keyboard"      "yes"
setkey "showDeviceFrame"  "no"
setkey "AvdId"            "$AVD_NAME"
setkey "avd.ini.displayname" "$AVD_NAME"
sed -i '/^avd\.id=/d; /^avd\.name=/d; /^disk\.dataPartition\.path=/d' "$CFG"
ok "AVD san sang (Android 13, 1080x2400, 2GB RAM, swiftshader)"

# ─────────────────────────────────────────────────────────────────────────
log "7/8 Khoi dong emulator"
ADB="$ANDROID_HOME/platform-tools/adb"
if [ "$("$ADB" -s emulator-5554 shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; then
  ok "emulator da chay san"
else
  # setsid: khong co no thi tien trinh bi don khi phien wsl.exe ket thuc.
  setsid "$ANDROID_HOME/emulator/emulator" -avd "$AVD_NAME" \
    -gpu swiftshader_indirect -no-snapshot-save -no-audio -no-boot-anim \
    -netdelay none -netspeed full -no-metrics \
    > /tmp/emulator.log 2>&1 < /dev/null &

  echo -n "  cho boot"
  for _ in $(seq 1 60); do
    [ "$("$ADB" -s emulator-5554 shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ] && break
    echo -n "."; sleep 5
  done
  echo
  [ "$("$ADB" -s emulator-5554 shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ] \
    || die "emulator khong boot xong. Xem /tmp/emulator.log"
  ok "emulator da boot"
fi

"$ADB" -s emulator-5554 shell input keyevent KEYCODE_WAKEUP >/dev/null 2>&1 || true
"$ADB" -s emulator-5554 shell settings put system screen_off_timeout 1800000 >/dev/null 2>&1 || true

if "$ADB" -s emulator-5554 shell dumpsys account 2>/dev/null | grep -q 'type=com.google'; then
  ok "da co Google account"
else
  warn "CHUA dang nhap Google. Mo Play Store tren cua so emulator va dang nhap,"
  warn "neu khong pipeline se dung o buoc installing_app."
fi

# ─────────────────────────────────────────────────────────────────────────
log "8/8 Dashboard + worker"
[ -f .env ] || die "Thieu .env o thu muc goc. Can NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RELEASE_OPS_WORKER_TOKEN."
grep -q '^RELEASE_OPS_WORKER_TOKEN=.\{24,\}' .env \
  || die "RELEASE_OPS_WORKER_TOKEN trong .env phai dai it nhat 24 ky tu. Sinh bang: openssl rand -hex 24"

# Chi dung service dashboard. Service app-relay-worker trong compose chay tren
# node:20-alpine khong co Android SDK — worker that phai chay native o duoi.
docker compose up -d --build app-relay-dashboard

echo -n "  cho dashboard"
for _ in $(seq 1 30); do
  curl -sf -m 5 "http://localhost:$DASHBOARD_PORT/api/app-relay/v1/health" >/dev/null 2>&1 && break
  echo -n "."; sleep 2
done
echo
curl -sf -m 5 "http://localhost:$DASHBOARD_PORT/api/app-relay/v1/health" >/dev/null \
  && ok "dashboard OK tren cong $DASHBOARD_PORT" \
  || warn "dashboard chua tra loi health"

cd workers/app-relay-worker
[ -f .env ] || die "Thieu workers/app-relay-worker/.env — copy tu .env.example va dien WORKER_TOKEN."
npm install --no-audit --no-fund --silent
npm run build
pm2 delete app-relay-worker >/dev/null 2>&1 || true
pm2 start ecosystem.config.js
pm2 save >/dev/null 2>&1 || true
cd "$SCRIPT_DIR"

sleep 8
log "Xong"
pm2 list
echo
echo "  Dashboard : http://localhost:$DASHBOARD_PORT/api/app-relay/v1/health"
echo "  Log worker: pm2 logs app-relay-worker"
echo "  Log emu   : /tmp/emulator.log"
