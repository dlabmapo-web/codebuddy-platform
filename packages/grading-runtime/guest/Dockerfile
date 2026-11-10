# Build-only fixture; final node packaging is owned by Task 3. No Docker per case.
FROM node:22.22.0-bookworm-slim@sha256:dd9d21971ec4395903fa6143c2b9267d048ae01ca6d3ea96f16cb30df6187d94 AS node
FROM python:3.12.12-slim-bookworm@sha256:593bd06efe90efa80dc4eee3948be7c0fde4134606dd40d8dd8dbcade98e669c AS build
# Snapshot pins the complete build dependency universe (base image is independently pinned).
RUN rm /etc/apt/sources.list.d/debian.sources && printf '%s\n' 'deb [check-valid-until=no] https://snapshot.debian.org/archive/debian/20260301T000000Z bookworm main' > /etc/apt/sources.list \
 && apt-get update && apt-get install -y --no-install-recommends git ca-certificates make g++ flex bison libprotobuf-dev protobuf-compiler libnl-route-3-dev pkg-config \
 && rm -rf /var/lib/apt/lists/*
RUN git init /build/nsjail && git -C /build/nsjail remote add origin https://github.com/google/nsjail.git \
 && git -C /build/nsjail fetch --depth=1 origin d8415bc8eea43cdd413daba25af63127019a1189 \
 && git -C /build/nsjail checkout --detach FETCH_HEAD \
 && git -C /build/nsjail submodule update --init --recursive \
 && make -C /build/nsjail -j2 \
 && install -m 0755 /build/nsjail/nsjail /usr/local/bin/nsjail
COPY bootstrap.py python.amd64.policy python.arm64.policy check-policy.c /opt/cove/
ARG TARGETARCH
RUN cp /opt/cove/python.${TARGETARCH}.policy /opt/cove/python.policy
RUN cc -I/build/nsjail/kafel/include /opt/cove/check-policy.c /build/nsjail/kafel/libkafel.a -o /opt/cove/check-policy && /opt/cove/check-policy /opt/cove/python.amd64.policy /opt/cove/python.arm64.policy
COPY tree-digest.py /opt/cove/tree_digest.py
COPY build-rootfs.py /opt/cove/build-rootfs.py
RUN python3 /opt/cove/build-rootfs.py
# native-gcc: the static exec gate, both architectures' compile/run policies
# compiled with the same Kafel, and the toolchain/run roots from the packages
# already installed above (GCC 12.2 from the pinned snapshot).
COPY exec-gate.c gcc-compile.amd64.policy gcc-compile.arm64.policy gcc-run.amd64.policy gcc-run.arm64.policy build-gcc-rootfs.py /opt/cove/
RUN cp /opt/cove/gcc-compile.${TARGETARCH}.policy /opt/cove/gcc-compile.policy \
 && cp /opt/cove/gcc-run.${TARGETARCH}.policy /opt/cove/gcc-run.policy \
 && /opt/cove/check-policy /opt/cove/gcc-compile.amd64.policy /opt/cove/gcc-compile.arm64.policy \
 && /opt/cove/check-policy /opt/cove/gcc-run.amd64.policy /opt/cove/gcc-run.arm64.policy \
 && gcc -static -O2 -Wall -Wextra -Werror -o /opt/cove/exec-gate /opt/cove/exec-gate.c \
 && cd /opt/cove && python3 /opt/cove/build-gcc-rootfs.py
COPY --from=node /usr/local/bin/node /usr/local/bin/node
CMD ["/usr/local/bin/nsjail", "--help"]
