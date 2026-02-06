#!/bin/bash

echo "🚀 배포 시작..."

# 1. 의존성 설치
echo "📦 의존성 설치 중..."
cd server && npm install --production=false
cd ../client && npm install
cd ..

# 2. Client 빌드
echo "🏗️  Client 빌드 중..."
cd client
npm run build
cd ..

# 3. Server 빌드
echo "🏗️  Server 빌드 중..."
cd server
npm run build
cd ..

# 4. 프로덕션 환경 변수 복사
echo "⚙️  환경 설정 중..."
cp server/.env.production server/dist/.env

echo "✅ 빌드 완료!"
echo ""
echo "📁 빌드 결과:"
echo "  - Server: server/dist/"
echo "  - Client: client/dist/"
echo ""
echo "🚀 서버 실행:"
echo "  cd server && NODE_ENV=production node dist/index.js"
echo ""
echo "또는 PM2 사용:"
echo "  pm2 start ecosystem.config.js"
