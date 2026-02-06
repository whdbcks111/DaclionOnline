import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from './utils/logger.js';

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
const io = new Server(httpServer, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// CORS 설정 (개발 환경에서만)
if (NODE_ENV === 'development') {
  app.use(cors({
    origin: CORS_ORIGIN,
    credentials: true
  }));
}

// API 라우트
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

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

// Socket.io 연결 처리
io.on('connection', (socket) => {
  logger.socket('클라이언트 연결됨:', socket.id);

  // 클라이언트로부터 메시지 받기
  socket.on('message', (data) => {
    logger.info('받은 메시지:', data);

    // 받은 메시지를 모든 클라이언트에게 브로드캐스트
    io.emit('message', {
      id: socket.id,
      data: data,
      timestamp: new Date().toISOString()
    });
  });

  // 클라이언트 연결 해제
  socket.on('disconnect', () => {
    logger.warn('클라이언트 연결 해제됨:', socket.id);
  });
});

httpServer.listen(SERVER_PORT, () => {
  logger.divider();
  logger.box('서버 시작 완료', 'green');
  logger.success(`서버 실행 중: http://localhost:${SERVER_PORT}`);
  logger.info(`환경: ${NODE_ENV}`);
  if (NODE_ENV === 'development') {
    logger.info(`CORS 허용: ${CORS_ORIGIN}`);
  }
  logger.success('Socket.io 준비 완료');
  logger.divider();
});
