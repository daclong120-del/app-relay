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

echo "no" | avdmanager create avd \
    --name "${AVD_NAME}" \
    --package "system-images;android-35;google_apis_playstore;x86_64" \
    --device "pixel_6" \
    --force

echo "[AVD] AVD ${AVD_NAME} created successfully."
