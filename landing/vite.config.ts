import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 이 프로젝트는 studybuks.store 루트 도메인 자체로 배포되는 별도 Vercel 프로젝트라
// admin과 달리 base 접두사가 필요 없다.
export default defineConfig({
  plugins: [react()],
  server: { port: 5175 },
});
