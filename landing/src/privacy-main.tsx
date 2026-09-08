import React from 'react';
import ReactDOM from 'react-dom/client';
import { PrivacyPage } from './pages/privacy';
import './index.css';
import { initAnalytics } from './analytics';

// /privacy는 라우터가 아니라 Vite의 두 번째 진입점이다. 실제 파일이 나오므로 심사자나
// 크롤러가 주소를 직접 열어도 SPA 리라이트 설정에 기대지 않고 그대로 뜬다.
initAnalytics();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PrivacyPage />
  </React.StrictMode>,
);
