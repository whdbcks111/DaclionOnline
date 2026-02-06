# 🚀 배포 가이드

## 오라클 클라우드 Ubuntu 서버 배포

### 사전 준비

1. **서버 접속**
```bash
ssh ubuntu@your-server-ip
```

2. **필수 소프트웨어 설치**
```bash
# Node.js 22.x 설치
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# PM2 설치 (프로세스 관리자)
sudo npm install -g pm2

# Git 설치 (없다면)
sudo apt-get install git
```

---

## 배포 단계

### 1. 코드 가져오기

```bash
# Git 클론
git clone <your-repo-url> daclion-online
cd daclion-online

# 또는 파일 직접 업로드
scp -r ./DaclionOnline ubuntu@your-server-ip:~/
```

### 2. 빌드 실행

```bash
# 배포 스크립트 실행
chmod +x deploy.sh
./deploy.sh
```

또는 수동 빌드:

```bash
# 1. 의존성 설치
cd server && npm install
cd ../client && npm install

# 2. Client 빌드
cd client && npm run build

# 3. Server 빌드
cd ../server && npm run build
```

### 3. 환경 변수 설정

서버에 `.env` 파일 생성:

```bash
cd ~/daclion-online/server
nano .env
```

내용:
```env
NODE_ENV=production
PORT=3000
```

### 4. PM2로 서버 실행

```bash
cd ~/daclion-online

# PM2로 시작
pm2 start ecosystem.config.js

# 상태 확인
pm2 status

# 로그 확인
pm2 logs daclion-online

# 서버 재시작
pm2 restart daclion-online

# 서버 중지
pm2 stop daclion-online
```

### 5. 부팅 시 자동 시작 설정

```bash
# PM2 startup 설정
pm2 startup

# 현재 PM2 프로세스 저장
pm2 save
```

---

## 방화벽 설정

오라클 클라우드에서 포트 열기:

### 오라클 클라우드 콘솔

1. **네트워킹** > **가상 클라우드 네트워크** 선택
2. **보안 목록** 클릭
3. **수신 규칙 추가**:
   - 소스 CIDR: `0.0.0.0/0`
   - IP 프로토콜: `TCP`
   - 대상 포트: `3000`

### Ubuntu 방화벽

```bash
# UFW 방화벽 설정
sudo ufw allow 3000/tcp
sudo ufw allow 22/tcp  # SSH
sudo ufw enable
sudo ufw status
```

---

## Nginx 리버스 프록시 (선택사항, 권장)

### Nginx 설치

```bash
sudo apt-get update
sudo apt-get install nginx
```

### Nginx 설정

```bash
sudo nano /etc/nginx/sites-available/daclion-online
```

내용:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # Socket.io WebSocket
    location /socket.io/ {
        proxy_pass http://localhost:3000/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

### Nginx 활성화

```bash
# 심볼릭 링크 생성
sudo ln -s /etc/nginx/sites-available/daclion-online /etc/nginx/sites-enabled/

# 설정 테스트
sudo nginx -t

# Nginx 재시작
sudo systemctl restart nginx

# 부팅 시 자동 시작
sudo systemctl enable nginx
```

---

## SSL 인증서 (HTTPS)

```bash
# Certbot 설치
sudo apt-get install certbot python3-certbot-nginx

# SSL 인증서 발급
sudo certbot --nginx -d your-domain.com

# 자동 갱신 테스트
sudo certbot renew --dry-run
```

---

## 업데이트 배포

코드 변경 후:

```bash
# 서버에 접속
ssh ubuntu@your-server-ip
cd daclion-online

# 코드 업데이트
git pull

# 빌드
./deploy.sh

# PM2 재시작
pm2 restart daclion-online
```

---

## 모니터링

### PM2 모니터링

```bash
# 실시간 모니터링
pm2 monit

# 로그 보기
pm2 logs

# 상태 확인
pm2 status
```

### 시스템 리소스

```bash
# CPU/메모리 사용량
htop

# 디스크 사용량
df -h

# 네트워크 상태
netstat -tuln | grep 3000
```

---

## 문제 해결

### 포트가 이미 사용 중
```bash
# 포트 사용 중인 프로세스 확인
sudo lsof -i :3000

# 프로세스 종료
sudo kill -9 <PID>
```

### PM2 프로세스 완전 제거
```bash
pm2 delete all
pm2 kill
```

### 로그 확인
```bash
# PM2 로그
pm2 logs daclion-online

# Nginx 로그
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log
```

---

## 빠른 명령어 모음

```bash
# 서버 시작
pm2 start ecosystem.config.js

# 서버 재시작
pm2 restart daclion-online

# 서버 중지
pm2 stop daclion-online

# 로그 보기
pm2 logs

# 상태 확인
pm2 status

# 업데이트 배포
git pull && ./deploy.sh && pm2 restart daclion-online
```
