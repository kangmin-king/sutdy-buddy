// FCM HTTP v1은 서버-투-서버 발송에 서비스 계정 OAuth2 액세스 토큰을 요구한다(레거시 서버 키
// API는 폐기됨). Firebase 콘솔 → 프로젝트 설정 → 서비스 계정에서 받은 JSON 전체를
// FCM_SERVICE_ACCOUNT_JSON 시크릿 하나로 저장해두고, 여기서 그 안의 private_key로 JWT를
// 서명해 액세스 토큰과 교환한다.

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const base64 = pem.replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '').replace(/\s/g, '');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function getServiceAccount(): ServiceAccount {
  const raw = Deno.env.get('FCM_SERVICE_ACCOUNT_JSON');
  if (!raw) throw new Error('FCM_SERVICE_ACCOUNT_JSON secret is not set');
  return JSON.parse(raw);
}

async function signJwt(serviceAccount: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const encoder = new TextEncoder();
  const unsigned = `${base64UrlEncode(encoder.encode(JSON.stringify(header)))}.${base64UrlEncode(encoder.encode(JSON.stringify(claims)))}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(serviceAccount.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(unsigned));
  return `${unsigned}.${base64UrlEncode(new Uint8Array(signature))}`;
}

async function getFcmAccessToken(serviceAccount: ServiceAccount): Promise<string> {
  const jwt = await signJwt(serviceAccount);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${encodeURIComponent(jwt)}`,
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error(`FCM token exchange failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

export interface FcmSendResult {
  ok: boolean;
  // 토큰이 더 이상 유효하지 않으면(기기에서 앱 삭제 등) true — 호출부가 sb_device_tokens에서 정리한다.
  staleToken: boolean;
}

export async function sendFcmMessage(fcmToken: string, title: string, body: string): Promise<FcmSendResult> {
  const serviceAccount = getServiceAccount();
  const accessToken = await getFcmAccessToken(serviceAccount);

  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ message: { token: fcmToken, notification: { title, body } } }),
  });

  if (res.ok) return { ok: true, staleToken: false };

  const errorBody = await res.text();
  const staleToken = errorBody.includes('UNREGISTERED') || errorBody.includes('NOT_FOUND') || errorBody.includes('INVALID_ARGUMENT');
  return { ok: false, staleToken };
}
