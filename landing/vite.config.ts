import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 이 프로젝트는 studybuks.store 루트 도메인 자체로 배포되는 별도 Vercel 프로젝트라
// admin과 달리 base 접두사가 필요 없다.
//
// 주의: 같은 폴더의 vite.config.js는 이 파일을 tsc가 컴파일해 놓은 산출물이고, Vite는
// 설정 파일을 찾을 때 .js를 .ts보다 먼저 고른다. 여기를 고치면 vite.config.js도 같이 고쳐야
// dev 서버에 반영된다.
export default defineConfig({
  plugins: [react()],
  server: { port: 5175 },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // 이 사이트는 라우터를 쓰지 않는다. /privacy는 두 번째 진입점으로 빌드해서 dist에 실제
  // privacy.html이 나오게 한다 — 개인정보처리방침과 계정 삭제 안내는 플레이 콘솔에 URL로
  // 제출해야 하므로, SPA 리라이트에 기대지 않고 파일로 존재하는 편이 확실하다.
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        privacy: fileURLToPath(new URL('./privacy.html', import.meta.url)),
      },
    },
  },
});
