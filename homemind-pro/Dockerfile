# HomeMind PRO — HA Add-on
# Bundles home-mind-server (Node.js) + Shodh Memory (Rust) in one container
# Ubuntu 24.04 base required: Shodh needs glibc 2.38+

# -------------------------------------------------------------------
# Stage 1: Download Shodh binary for target architecture
# -------------------------------------------------------------------
FROM ubuntu:24.04 AS shodh

ARG SHODH_VERSION=v0.1.91

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Detect architecture at build time (works with both legacy builder and BuildKit)
RUN ARCH=$(uname -m) \
    && SHODH_ARCH=$(if [ "$ARCH" = "aarch64" ]; then echo "arm64"; else echo "x64"; fi) \
    && curl -fsSL "https://github.com/varun29ankuS/shodh-memory/releases/download/${SHODH_VERSION}/shodh-memory-linux-${SHODH_ARCH}.tar.gz" \
       -o /tmp/shodh.tar.gz \
    && mkdir -p /tmp/shodh \
    && tar -xzf /tmp/shodh.tar.gz -C /tmp/shodh \
    && find /tmp/shodh -name 'shodh-memory*' -type f -executable -exec cp {} /usr/local/bin/shodh-memory \; \
    && find /tmp/shodh -name 'libonnxruntime*' -type f -exec cp {} /usr/local/lib/ \; \
    && chmod +x /usr/local/bin/shodh-memory \
    && rm -rf /tmp/shodh /tmp/shodh.tar.gz

# -------------------------------------------------------------------
# Stage 2: Build home-mind-server from GitHub
# -------------------------------------------------------------------
FROM node:22-bookworm-slim AS builder

ARG HOME_MIND_VERSION=v0.13.0

RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Clone the server source at a pinned tag
RUN git clone --depth 1 --branch ${HOME_MIND_VERSION} \
    https://github.com/hoornet/home-mind.git /tmp/home-mind

# Build the server
RUN cp /tmp/home-mind/src/home-mind-server/package*.json ./ \
    && npm ci \
    && cp -r /tmp/home-mind/src/home-mind-server/src ./src \
    && cp /tmp/home-mind/src/home-mind-server/tsconfig.json ./ \
    && npx tsc

# Production dependencies only
RUN rm -rf node_modules && npm ci --omit=dev

# -------------------------------------------------------------------
# Stage 3: Runtime — Ubuntu 24.04 + s6-overlay + Node.js + Shodh
# -------------------------------------------------------------------
FROM ubuntu:24.04

ARG S6_OVERLAY_VERSION=3.2.0.2
ARG NODE_MAJOR=22

# Prevent interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Install base packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    gnupg \
    xz-utils \
    jq \
    openssl \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Install s6-overlay (detect architecture at build time)
RUN ARCH=$(uname -m) \
    && S6_ARCH=$(if [ "$ARCH" = "aarch64" ]; then echo "aarch64"; else echo "x86_64"; fi) \
    && curl -fsSL "https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-noarch.tar.xz" \
       | tar -C / -Jxpf - \
    && curl -fsSL "https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-${S6_ARCH}.tar.xz" \
       | tar -C / -Jxpf -

# Install Node.js
RUN curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install bashio (HA add-on helper library)
RUN curl -fsSL https://github.com/hassio-addons/bashio/archive/refs/tags/v0.16.2.tar.gz \
    | tar -xzf - \
    && mv bashio-0.16.2/lib /usr/lib/bashio \
    && ln -s /usr/lib/bashio/bashio /usr/bin/bashio \
    && rm -rf bashio-0.16.2

# Copy Shodh binary and ONNX runtime from stage 1
COPY --from=shodh /usr/local/bin/shodh-memory /usr/local/bin/shodh-memory
COPY --from=shodh /usr/local/lib/libonnxruntime* /usr/local/lib/
RUN ldconfig

# Copy built server from stage 2
WORKDIR /opt/homemind
COPY --from=builder /build/dist ./dist
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/package.json ./

# Copy s6-overlay service definitions and scripts
COPY rootfs /

# Ensure all scripts are executable
RUN find /etc/s6-overlay -name 'run' -exec chmod +x {} \; \
    && find /etc/s6-overlay -name 'finish' -exec chmod +x {} \; \
    && chmod +x /usr/local/bin/options-to-env.sh

# Persistent data volume (Shodh data, conversations, keys)
VOLUME ["/data"]

ENTRYPOINT ["/init"]
