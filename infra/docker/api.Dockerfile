# 로컬과 EC2(3.5단계)가 같은 이미지를 써요
ARG RUST_VERSION=1.99.1
FROM rust:${RUST_VERSION}-bookworm AS build
WORKDIR /app
ENV CARGO_BUILD_JOBS=4
COPY Cargo.toml Cargo.lock rust-toolchain.toml ./
COPY services/api/ ./services/api/
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/app/target \
    cargo build --locked --release --package catchup-api --bin catchup-api \
    && install -Dm755 /app/target/release/catchup-api /out/catchup-api

FROM debian:bookworm-slim AS runtime
RUN groupadd --system --gid 10001 catchup && useradd --system --uid 10001 --gid catchup --no-create-home catchup
COPY --from=build /out/catchup-api /usr/local/bin/catchup-api
USER 10001:10001
ENTRYPOINT ["/usr/local/bin/catchup-api"]

# 에이전트 일꾼: 로그인 쪽. 명령을 실행할 환경은 넣지 않아요(샌드박스는 다른 컨테이너)
# --build-context codex=<sha256 을 맞춘 Codex 0.163.0 묶음>
FROM debian:bookworm-slim AS codex-checked
COPY --from=codex / /opt/codex/
COPY infra/codex/0.163.0-linux-arm64.sha256 /opt/codex.sha256
RUN cd /opt/codex && sha256sum -c --strict /opt/codex.sha256 && chmod -R a+rX,go-w /opt/codex && rm bin/codex-code-mode-host

FROM debian:bookworm-slim AS agent
RUN groupadd --system --gid 10001 catchup && useradd --system --uid 10001 --gid catchup --no-create-home catchup
# 실행기(code-mode host)가 없는 묶음 — 모델의 JS 가 토큰 옆에서 돌 길이 없게
COPY --from=codex-checked /opt/codex/ /opt/codex/
RUN install -d -o 10001 -g 10001 -m 0700 /data/codex
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=build /out/catchup-api /usr/local/bin/catchup-api
USER 10001:10001
ENTRYPOINT ["/usr/local/bin/catchup-api"]

# 샌드박스: 명령을 실행하는 쪽. 네트워크 · 비밀값 없이 돌려요(compose 의 sandbox-*)
# 바탕은 빌드와 같은 이미지라 git · python3 · gcc · cargo 가 들어 있어요
# --build-context codexcli=<sha256 을 맞춘 Codex 0.163.0 CLI>
FROM rust:${RUST_VERSION}-bookworm AS sandbox
COPY --from=codexcli /codex-aarch64-unknown-linux-musl /opt/codex/codex-aarch64-unknown-linux-musl
COPY infra/codex/0.163.0-linux-arm64-cli.sha256 /opt/codex.sha256
RUN cd /opt/codex && sha256sum -c --strict /opt/codex.sha256 \
    && chmod 0755 codex-aarch64-unknown-linux-musl \
    && find / -xdev -type f -perm /6000 -exec chmod a-s {} + \
    && groupadd --gid 10002 agent && useradd --uid 10002 --gid agent --no-create-home --home-dir /home/agent agent \
    && install -d -m 0700 /state && install -d -m 0750 /sock && install -d -o 10002 -g 10002 -m 0700 /workspace && install -d /home/agent
COPY --from=build /out/catchup-api /usr/local/sbin/catchup-api
ENTRYPOINT ["/usr/local/sbin/catchup-api"]
CMD ["sandbox"]

# 모델이 쓴 JS 를 돌리는 곳: 망 · 비밀값 · 작업 폴더 없이(compose 의 codehost)
FROM debian:bookworm-slim AS codehost
COPY --from=codex /bin/codex-code-mode-host /opt/codex/bin/codex-code-mode-host
COPY infra/codex/0.163.0-linux-arm64.sha256 /opt/codex.sha256
RUN cd /opt/codex && grep codex-code-mode-host /opt/codex.sha256 | sha256sum -c --strict && chmod 0755 bin/codex-code-mode-host \
    && find / -xdev -type f -perm /6000 -exec chmod a-s {} + \
    && install -d -m 0750 /sock
COPY --from=build /out/catchup-api /usr/local/sbin/catchup-api
ENTRYPOINT ["/usr/local/sbin/catchup-api"]
CMD ["codehost"]
