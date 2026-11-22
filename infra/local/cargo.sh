#!/bin/zsh
# 이 Mac 에 있는 Rust 1.99.1 로 빌드해요. 받은 꾸러미는 .local/cargo 에만 둬요.
set -euo pipefail
ROOT="${0:A:h:h:h}"
TC="$HOME/.rustup/toolchains/1.99.1-aarch64-apple-darwin/bin"
[[ -x "$TC/cargo" ]] || { print -u2 "Rust 1.99.1 이 없어요: $TC"; exit 1; }
export PATH="$TC:$PATH" CARGO_HOME="$ROOT/.local/cargo" RUSTC="$TC/rustc"
cd "$ROOT"
exec cargo "$@"
