/** 두 운영 도메인은 각각 자기 origin의 API/Socket을 사용하고 포털에서 인증을 연결한다. */
export const SERVER_URL = import.meta.env.PROD
  ? window.location.origin
  : import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'
