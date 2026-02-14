import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from './utils/logger.js';
import prisma from './config/prisma.js';
import { initSocket } from './modules/socket.js';
import { initRegister } from './modules/register.js';
import { initLogin } from './modules/login.js';

// 환경 변수 로드
dotenv.config();

// ES 모듈에서 __dirname 사용하기
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);

// 환경 변수에서 설정 가져오기
const SERVER_PORT = process.env.PORT || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';
const NODE_ENV = process.env.NODE_ENV || 'development';

// Socket.io 서버 설정
initSocket(httpServer, CORS_ORIGIN);

// 모듈들 초기화
initRegister();
initLogin();

// CORS 설정 (개발 환경에서만)
if (NODE_ENV === 'development') {
  app.use(cors({
    origin: CORS_ORIGIN,
    credentials: true
  }));
}

// Body parser 미들웨어
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 프로덕션: Client 정적 파일 제공
if (NODE_ENV === 'production') {
  const clientDistPath = path.join(__dirname, '../../client/dist');

  // 정적 파일 제공
  app.use(express.static(clientDistPath));

  // SPA를 위한 fallback - 모든 경로를 index.html로
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });

  logger.info('정적 파일 제공:', clientDistPath);
}

httpServer.listen(SERVER_PORT, async () => {
  logger.divider();
  logger.box('서버 시작 완료', 'green');
  logger.success(`서버 실행 중: http://localhost:${SERVER_PORT}`);
  logger.info(`환경: ${NODE_ENV}`);
  if (NODE_ENV === 'development') {
    logger.info(`CORS 허용: ${CORS_ORIGIN}`);
  }
  logger.success('Socket.io 준비 완료');

  // Prisma 데이터베이스 연결 테스트
  try {
    await prisma.$connect();
    logger.success('MariaDB 연결 성공 (Prisma)');
  } catch (error) {
    logger.error('MariaDB 연결 실패:', error);
  }

  logger.divider();
});

// 프로세스 종료 시 정리
process.on('SIGINT', async () => {
  logger.warn('SIGINT: 서버 종료 중...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.warn('SIGTERM: 서버 종료 중...');
  await prisma.$disconnect();
  process.exit(0);
});

function handleLogin(id: string | undefined, pw: string | undefined) {
  
}