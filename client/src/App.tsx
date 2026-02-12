import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { SocketProvider, useSocket } from './context/SocketContext'
import { ThemeProvider } from './context/ThemeContext'
import ThemeToggle from './components/ThemeToggle'
import Login from './pages/Login'
import Home from './pages/Home'
import Register from './pages/Register'

function SessionHandler() {
  const { socket } = useSocket();
  const navigate = useNavigate();
  const location = useLocation();

  // 서버에서 세션 무효 시 로그인 페이지로
  useEffect(() => {
    if (!socket) return;

    const onSessionInvalid = () => {
      navigate('/login', { replace: true });
    };

    socket.on('sessionInvalid', onSessionInvalid);
    return () => { socket.off('sessionInvalid', onSessionInvalid); };
  }, [socket, navigate]);

  // 서버에서 세션 복원 시 홈으로
  useEffect(() => {
    if (!socket) return;

    const onSessionRestore = (data: { username: string, nickname: string }) => {
      if (location.pathname === '/login' || location.pathname === '/register' || location.pathname === '/') {
        navigate('/home');
      }
    };

    socket.on('sessionRestore', onSessionRestore);
    return () => { socket.off('sessionRestore', onSessionRestore); };
  }, [socket, location.pathname, navigate]);

  return null;
}

function App() {
  return (
    <ThemeProvider>
      <SocketProvider>
        <BrowserRouter>
          <SessionHandler />
          {/* 다크모드 토글 버튼 (모든 페이지에 표시) */}
          <ThemeToggle />

          <Routes>
            {/* 기본 경로 - /login으로 리다이렉트 */}
            <Route path="/" element={<Navigate to="/login" replace />} />

            {/* 로그인 페이지 */}
            <Route path="/login" element={<Login />} />

            {/* 회원가입 페이지 */}
            <Route path="/register" element={<Register />} />

            {/* 홈 페이지 (로그인 후) */}
            <Route path="/home" element={<Home />} />

            {/* 404 - 존재하지 않는 경로는 /login으로 */}
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
      </SocketProvider>
    </ThemeProvider>
  )
}

export default App
