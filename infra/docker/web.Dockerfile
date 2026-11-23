# 운영 앞단(3.5단계): HTTPS · 웹 앱(실제 모드) · /v1 을 서버로 넘기기. 로컬 개발은 pnpm dev:live 를 써요.
# 웹은 먼저 Mac 에서 구워요(이미지 안에서 npm 을 받지 않아요):
#   (cd apps/web && pnpm exec vite build --mode live --outDir dist-live)
# Caddy 2.11.9(arm64). 판을 올릴 때는 지문도 같이 바꿔요
ARG CADDY_IMAGE=caddy:2.11.9-alpine@sha256:003a97808e781aa9f7e75cc2f43d34d461099031faf5e20faefb9f61126836f0
FROM ${CADDY_IMAGE}
COPY infra/ec2/Caddyfile /etc/caddy/Caddyfile
COPY infra/ec2/tls-auto.caddy infra/ec2/tls-internal.caddy /etc/caddy/
COPY apps/web/dist-live/ /srv/web/
