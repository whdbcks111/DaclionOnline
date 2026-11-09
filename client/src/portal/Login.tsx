import { getGameStartUrl } from '../utils/siteNavigation'
// 로그인 페이지
import { useState, useRef, useEffect } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import styles from './AuthLayout.module.scss'
import AuthLayout from './AuthLayout'
import { useSocket } from '../context/SocketContext';
import { validateId, validatePassword } from '../utils/validators';
import type { LoginResult } from '@shared/types';

function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const destination = params.get("next") === "daclion" ? "/games/daclion/" : "/";
  const { socket, isConnected, sessionInfo, isSessionReady } = useSocket();
  
  const idRef = useRef<HTMLInputElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);

  const [error, setError] = useState('');

  useEffect(() => {
    if (isSessionReady && sessionInfo && destination === '/games/daclion/' && getGameStartUrl() === '/auth/daclion') {
      window.location.replace(getGameStartUrl());
    }
  }, [isSessionReady, sessionInfo, destination]);

  useEffect(() => {
    if (!socket) return;

    const onLoginResult = (result: LoginResult) => {
      if (result.ok) {
        document.cookie = `sessionToken=${result.sessionToken}; path=/; max-age=${60 * 60 * 24 * 7}`;
        if (destination === "/games/daclion/" && getGameStartUrl() === "/auth/daclion") {
          window.location.assign(getGameStartUrl());
        } else navigate(destination);
      } else {
        setError(result.error ?? '오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
      }
    };

    socket.on('loginResult', onLoginResult);
    return () => { socket.off('loginResult', onLoginResult); };
  }, [socket, navigate, destination]);

  const login = () => {
    const id = idRef.current?.value ?? '';
    const pw = pwRef.current?.value ?? '';

    const idValidateResult = validateId(id);
    if(idValidateResult) {
      setError(idValidateResult);
      return;
    }

    const pwValidateResult = validatePassword(pw);
    if(pwValidateResult) {
      setError(pwValidateResult);
      return;
    }

    if(isConnected && socket) {
      setError('');
      socket.emit('login', {
        id,
        pw
      });
      return;
    }
    
    setError('서버가 원활하지 않습니다. 잠시 후 다시 시도해주세요.');
  }

  return <AuthLayout title="로그인" description="GAME BOX 계정으로 로그인하고 모험을 이어가세요."
    footer={<p>아직 계정이 없나요? <Link to='/register'>회원가입</Link></p>}>
    <form className={styles.form} onSubmit={event => { event.preventDefault(); login(); }}>
      <div className={styles.field}>
        <label htmlFor="login-id">아이디</label>
        <input id="login-id" type="text" name="username" ref={idRef} placeholder="아이디를 입력해주세요" autoComplete="username" required />
      </div>
      <div className={styles.field}>
        <div className={styles.labelRow}><label htmlFor="login-password">비밀번호</label><Link to='/password-reset'>비밀번호 찾기</Link></div>
        <input id="login-password" type="password" name="password" ref={pwRef} placeholder="비밀번호를 입력해주세요" autoComplete="current-password" required />
      </div>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <button className={styles.submit} type="submit" disabled={!isConnected}>로그인</button>
      <p className={styles.hint}>{isConnected ? '기존 DaclionOnline 계정으로도 로그인할 수 있어요.' : '서버에 연결하고 있습니다…'}</p>
    </form>
  </AuthLayout>;
}

export default Login
