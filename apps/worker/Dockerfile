FROM eclipse-temurin:17-jdk-jammy

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
    libpulse0 \
    libgl1-mesa-glx \
    libvirt-clients \
    cpu-checker \
    net-tools \
    procps \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && corepack enable \
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
