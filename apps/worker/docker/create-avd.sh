#!/bin/bash
set -e

AVD_NAME="${ANDROID_AVD:-chpay}"
AVD_HOME="${ANDROID_AVD_HOME:-/home/worker/.android/avd}"

if [ -d "${AVD_HOME}/${AVD_NAME}.avd" ]; then
    echo "[AVD] AVD ${AVD_NAME} already exists."
    exit 0
fi

echo "[AVD] Creating AVD ${AVD_NAME}..."
mkdir -p "${AVD_HOME}"

# -c sizes the userdata partition. The pixel_6 profile defaults to ~2G, which
# fills up once Play Store caches plus a few hundred MB of APK land on it.
echo "no" | avdmanager create avd \
    --name "${AVD_NAME}" \
    --package "system-images;android-35;google_apis_playstore;x86_64" \
    --device "pixel_6" \
    --sdcard "${AVD_SDCARD_SIZE:-2G}" \
    -c "${AVD_DATA_SIZE:-12G}" \
    --force

CONFIG="${AVD_HOME}/${AVD_NAME}.avd/config.ini"
if [ -f "${CONFIG}" ]; then
    # Drop any pre-existing value before appending so re-runs stay idempotent.
    sed -i '/^hw\.ramSize=/d;/^vm\.heapSize=/d;/^disk\.dataPartition\.size=/d;/^hw\.keyboard=/d' "${CONFIG}"
    {
        echo "hw.ramSize=${AVD_RAM_MB:-3072}"
        echo "vm.heapSize=${AVD_HEAP_MB:-512}"
        echo "disk.dataPartition.size=${AVD_DATA_SIZE:-12G}"
        echo "hw.keyboard=yes"
    } >> "${CONFIG}"
    echo "[AVD] Tuned ${CONFIG} (ram=${AVD_RAM_MB:-3072}MB, data=${AVD_DATA_SIZE:-12G})"
fi

echo "[AVD] AVD ${AVD_NAME} created successfully."
