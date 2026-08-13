import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // 메인 도메인의 /admin/* → 이 배포로 프록시되는 구조라, 에셋 경로도 /admin/ 접두사를 달아야
  // 브라우저가 /admin/assets/...로 요청해서(그래야 rewrite가 프록시해줌) 로드된다.
  base: '/admin/',
  plugins: [react()],
  server: { port: 5174 },
});
