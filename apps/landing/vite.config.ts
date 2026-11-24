import { fileURLToPath } from 'node:url';
import { createServer, defineConfig, type Plugin, type ViteDevServer } from 'vite';

// 소개 페이지는 React로 짜고, 빌드할 때 정적 HTML로 구워요. 브라우저에는 React가 실리지 않아요.
// index.html(영어)과 ko/index.html(한국어)의 <!--head-->, <!--page--> 자리에 src/render.tsx 의 결과를 넣어요.
const root = fileURLToPath(new URL('.', import.meta.url));

function prerender(): Plugin {
  let dev: ViteDevServer | undefined;
  let own: ViteDevServer | undefined;
  const loader = async () => dev ?? (own ??= await createServer({
    root, configFile: false, appType: 'custom', logLevel: 'error',
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },   // 빌드 뒤 프로세스가 남지 않게 파일 감시를 켜지 않아요
    esbuild: { jsx: 'automatic' },
  }));
  return {
    name: 'catchup-prerender',
    configureServer(server) { dev = server; },
    transformIndexHtml: {
      order: 'pre',
      async handler(html, ctx) {
        const lang = ctx.path.startsWith('/ko/') ? 'ko' : 'en';
        const server = await loader();
        const { render } = await server.ssrLoadModule('/src/render.tsx') as typeof import('./src/render');
        // 개발 서버에서는 apps/web 개발 서버(5180)를, 빌드에서는 같은 주소의 /app/ 을 품어요
        const app = dev ? (process.env.CATCHUP_APP ?? "http://127.0.0.1:5180/") : "/app/";
        const { head, page, htmlLang } = render(lang, app);
        return html.replace('<html lang="en">', `<html lang="${htmlLang}">`).replace('<!--head-->', head).replace('<!--page-->', page);
      },
    },
    // 페이지 원본(.tsx, 문구)을 고치면 HTML 을 새로 구워야 해서 화면을 다시 읽어요
    handleHotUpdate({ file, server }) {
      if (/\/src\/(?!main\.ts).+\.tsx?$/.test(file)) server.ws.send({ type: 'full-reload' });
    },
    async closeBundle() { await own?.close(); own = undefined; },
  };
}

export default defineConfig({
  plugins: [prerender()],
  esbuild: { jsx: 'automatic' },
  build: {
    rollupOptions: { input: { en: `${root}index.html`, ko: `${root}ko/index.html` } },
    assetsInlineLimit: 0,
  },
});
