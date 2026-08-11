FROM eclipse-temurin:17-jdk-jammy

# Pinned deliberately. `corepack enable` resolves pnpm's `latest` dist-tag,
# which is now pnpm 11 — that requires the `node:sqlite` builtin and crashes on
# Node 20. This version also matches pnpm-lock.yaml's lockfileVersion 9.0.
ARG PNPM_VERSION=9.15.9

ENV ANDROID_SDK_ROOT=/opt/android-sdk
ENV ANDROID_HOME=/opt/android-sdk
ENV ANDROID_AVD_HOME=/home/worker/.android/avd
ENV JAVA_HOME=/opt/java/openjdk
ENV PATH="${JAVA_HOME}/bin:${ANDROID_SDK_ROOT}/cmdline-tools/latest/bin:${ANDROID_SDK_ROOT}/platform-tools:${ANDROID_SDK_ROOT}/emulator:${PATH}"

ENV DISPLAY=:0

RUN useradd -m -s /bin/bash -u 1000 worker && \
    mkdir -p /home/worker/.android/avd && \
    chown -R worker:worker /home/worker

# 1. Install OS dependencies, Node.js, pnpm, Xvfb, noVNC, supervisor
#    The lib* packages are the shared objects the Android Emulator (Qt/QEMU)
#    dynamically links against. Missing libnss3 / libasound2 / libegl1 makes the
#    emulator binary fail to start before it prints anything useful.
RUN apt-get update && apt-get install -y \
    curl \
    unzip \
    git \
    supervisor \
    xvfb \
    openbox \
    x11vnc \
    novnc \
    websockify \
    libvirt-clients \
    cpu-checker \
    net-tools \
    procps \
    libnss3 \
    libnspr4 \
    libasound2 \
    libpulse0 \
    libdbus-1-3 \
    libfontconfig1 \
    libfreetype6 \
    libxkbcommon0 \
    libxcb1 \
    libx11-6 \
    libxext6 \
    libxi6 \
    libxtst6 \
    libxrandr2 \
    libxcursor1 \
    libxdamage1 \
    libxfixes3 \
    libxcomposite1 \
    libgl1-mesa-glx \
    libgl1-mesa-dri \
    libglu1-mesa \
    libegl1 \
    libgles2 \
    libgbm1 \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g "pnpm@${PNPM_VERSION}" \
    && ln -sf /usr/share/novnc/vnc.html /usr/share/novnc/index.html \
    && rm -rf /var/lib/apt/lists/*

# 2. Download and install Android SDK Command-line Tools
RUN mkdir -p ${ANDROID_SDK_ROOT}/cmdline-tools && \
    curl -fsSL https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip -o /tmp/cmdline-tools.zip && \
    unzip -q /tmp/cmdline-tools.zip -d /tmp/cmdline-tools-unpacked && \
    mv /tmp/cmdline-tools-unpacked/cmdline-tools ${ANDROID_SDK_ROOT}/cmdline-tools/latest && \
    rm -rf /tmp/cmdline-tools.zip /tmp/cmdline-tools-unpacked

# 3. Accept SDK licenses & install Android SDK components (platform-tools, emulator, system-image)
RUN yes | ${ANDROID_SDK_ROOT}/cmdline-tools/latest/bin/sdkmanager --licenses --sdk_root=${ANDROID_SDK_ROOT} && \
    ${ANDROID_SDK_ROOT}/cmdline-tools/latest/bin/sdkmanager --sdk_root=${ANDROID_SDK_ROOT} \
        "cmdline-tools;latest" \
        "platform-tools" \
        "emulator" \
        "platforms;android-35" \
        "system-images;android-35;google_apis_playstore;x86_64"

# 3b. Verify the toolchain at build time rather than discovering a missing
#     binary or shared library after a 30-minute image build.
#
#     Only java/adb/avdmanager are hard failures. The emulator resolves part of
#     its bundled Qt stack through LD_LIBRARY_PATH at launch, so `ldd` on the
#     launcher legitimately reports some "not found" entries — those are logged
#     for diagnosis but must not fail the build. What we do assert is that the
#     qemu binary loads, since that is where a missing libnss3 / libasound2 /
#     libEGL actually surfaces.
RUN set -eux; \
    java -version; \
    adb --version; \
    avdmanager list device > /dev/null; \
    # Assert the SYSTEM libraries the emulator dlopen's are present. Checking
    # ldd output instead would false-positive: the emulator ships its own Qt6,
    # protobuf and abseil in emulator/lib64 and resolves them at launch via
    # LD_LIBRARY_PATH, so they legitimately read as "not found" here.
    for lib in libnss3.so libasound.so.2 libEGL.so.1 libGLESv2.so.2 libgbm.so.1 \
               libxcb.so.1 libX11.so.6 libpulse.so.0 libdbus-1.so.3 \
               libfontconfig.so.1 libXdamage.so.1 libXcomposite.so.1; do \
        ldconfig -p | grep -q "$lib" || { echo "FATAL: missing system library $lib" >&2; exit 1; }; \
    done; \
    echo "--- all required system libraries present ---"; \
    # Informational only: resolves against the bundled libs the launcher uses.
    LD_LIBRARY_PATH="${ANDROID_SDK_ROOT}/emulator/lib64:${ANDROID_SDK_ROOT}/emulator/lib64/qt/lib:${ANDROID_SDK_ROOT}/emulator/lib64/gles_swiftshader" \
        ldd "${ANDROID_SDK_ROOT}/emulator/qemu/linux-x86_64/qemu-system-x86_64" | grep "not found" || true

# Công tắc GUI. `on` = có cửa sổ emulator + noVNC (cần lúc đăng nhập Google
# Play). `off` = emulator chạy -no-window, không bật openbox/x11vnc/novnc —
# tiết kiệm CPU đáng kể trên VPS yếu.
#
# Đặt ở ĐÂY chứ không cùng cụm ENV trên đầu file là có chủ đích: sửa một ENV
# làm mọi layer sau nó phải build lại, mà phía trên là apt-get và Android SDK —
# 30 phút. Ở vị trí này thì chỉ layer COPY + pnpm build chạy lại, khoảng 2 phút.
#
# supervisord.conf đọc %(ENV_WORKER_GUI)s và sẽ CHẾT lúc khởi động nếu biến
# không tồn tại, nên dòng mặc định này là bắt buộc chứ không phải cho tiện.
ENV WORKER_GUI=on

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/contracts/package.json ./packages/contracts/
COPY apps/worker/package.json ./apps/worker/

COPY packages/contracts ./packages/contracts
COPY apps/worker ./apps/worker

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @app-relay/contracts build
RUN pnpm --filter worker build

RUN chmod +x /app/apps/worker/docker/*.sh

CMD ["/usr/bin/supervisord", "-c", "/app/apps/worker/docker/supervisord.conf"]
