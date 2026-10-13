FROM debian:bookworm-slim AS build
ARG WHISPER_VERSION=v1.9.5
RUN apt-get update && apt-get install -y --no-install-recommends build-essential cmake git ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 --branch "$WHISPER_VERSION" https://github.com/ggml-org/whisper.cpp /src
WORKDIR /src
# GCC 12 does not know Apple's cores, so on a Mac `-mcpu=native` inside the VM reports a plain
# armv8-a and the half-precision kernels fail to build. Naming the architecture avoids the
# guess: armv8.2-a with fp16 and dotprod runs on every Apple silicon Mac and current ARM servers.
RUN case "$(uname -m)" in \
      aarch64|arm64) cpu_options="-DGGML_NATIVE=OFF -DGGML_CPU_ARM_ARCH=armv8.2-a+fp16+dotprod" ;; \
      *) cpu_options="" ;; \
    esac \
  && cmake -B build -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DWHISPER_BUILD_TESTS=OFF $cpu_options \
  && cmake --build build --config Release --target whisper-server -j "$(nproc)"

FROM debian:bookworm-slim
# ffmpeg lets the server accept any recording format; curl is used once, by `offee setup`, to
# download the model while setup still has a network.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg curl ca-certificates libgomp1 \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /src/build/bin/whisper-server /usr/local/bin/whisper-server
RUN useradd --uid 1000 --create-home whisper && mkdir -p /models && chown 1000:1000 /models
USER 1000:1000
WORKDIR /home/whisper
EXPOSE 8090
CMD ["whisper-server", "--model", "/models/ggml-large-v3-turbo-q5_0.bin", "--host", "0.0.0.0", "--port", "8090", "--convert"]
