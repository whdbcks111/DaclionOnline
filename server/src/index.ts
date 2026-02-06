import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import logger from './utils/logger.js';

// 환경 변수 로드
dotenv.config();

const app = express();
const httpServer = createServer(app);

// 환경 변수에서 설정 가져오기
const SERVER_PORT = process.env.PORT || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

// Socket.io 서버 설정
const io = new Server(httpServer, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

app.use(cors({
  origin: CORS_ORIGIN,
  credentials: true
}));

// 간단한 health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

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
  logger.info(`CORS 허용: ${CORS_ORIGIN}`);
  logger.success('Socket.io 준비 완료');
  logger.divider();
});
