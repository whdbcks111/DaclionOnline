import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import logger from './utils/logger.js';
import prisma from './config/prisma.js';
import { initSocket } from './modules/socket.js';
import { initRegister } from './modules/register.js';
import { initLogin } from './modules/login.js';
import { initChat } from './modules/chat.js';
import { initBot } from './modules/bot.js';
import { initPlayer, saveAllPlayers } from './modules/player.js';
import { initGame } from './modules/game.js';
import './data/items.js';
import './data/monsters.js';
import './data/locations.js';
import { initLocation } from './modules/location.js';
import { uploadRouter } from './modules/upload.js';

// 환경 변수 로드
dotenv.config();

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
initChat();
initBot();
initPlayer();
initLocation();
initGame();

// 프로필 이미지 등 업로드 파일 정적 서빙
const uploadsPath = path.join(process.cwd(), 'uploads');
app.use('/uploads', express.static(uploadsPath));

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

// API 라우트
app.use('/api', uploadRouter);

// 프로덕션: Client 정적 파일 제공
if (NODE_ENV === 'production') {
  const clientDistPath = path.join(process.cwd(), '../client/dist');

  // 정적 파일 제공
  app.use(express.static(clientDistPath));

  // SPA를 위한 fallback - 모든 경로를 index.html로
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });

  logger.info('정적 파일 제공:', clientDistPath);
}

// 잘못된 URI 요청 에러 핸들러 (봇 스캔 등)
app.use((err: any, req: any, res: any, next: any) => {
  if (err instanceof URIError) {
    res.status(400).end();
    return;
  }
  next(err);
});

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
    logger.success('마스터 데이터 로드 완료');
  } catch (error) {
    logger.error('MariaDB 연결 실패:', error);
  }

  logger.divider();
});

// 프로세스 종료 시 정리
process.on('SIGINT', async () => {
  logger.warn('SIGINT: 서버 종료 중...');
  await saveAllPlayers();
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.warn('SIGTERM: 서버 종료 중...');
  await saveAllPlayers();
  await prisma.$disconnect();
  process.exit(0);
});