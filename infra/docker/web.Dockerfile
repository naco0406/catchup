# 운영 앞단(3.5단계): HTTPS · 웹 앱(실제 모드) · /v1 을 서버로 넘기기. 로컬 개발은 pnpm dev:live 를 써요.
# 웹은 먼저 Mac 에서 구워요(이미지 안에서 npm 을 받지 않아요):
#   (cd apps/web && pnpm exec vite build --mode live --outDir dist-live)
# Caddy 는 받은 뒤 판과 sha256 으로 고정해요(아직 받지 않았어요 — 받기 전에 소유자에게 물어요).
ARG CADDY_IMAGE=caddy:2-alpine
FROM ${CADDY_IMAGE}
COPY infra/ec2/Caddyfile /etc/caddy/Caddyfile
COPY infra/ec2/tls-auto.caddy infra/ec2/tls-internal.caddy /etc/caddy/
COPY apps/web/dist-live/ /srv/web/
