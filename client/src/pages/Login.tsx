// 로그인 페이지
import { useState, useRef, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import styles from './Login.module.scss'
import { useSocket } from '../context/SocketContext';
import { validateId, validatePassword } from '../utils/validators';
import type { LoginResult } from '../shared/types';

function Login() {
  const navigate = useNavigate();
  const { socket, isConnected } = useSocket();
  
  const idRef = useRef<HTMLInputElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);

  const [error, setError] = useState('');

  useEffect(() => {
    if (!socket) return;

    const onLoginResult = (result: LoginResult) => {
      if (result.ok) {
        document.cookie = `sessionToken=${result.sessionToken}; path=/; max-age=${60 * 60 * 24 * 7}`;
        navigate('/home');
      } else {
        setError(result.error ?? '오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
      }
    };

    socket.on('loginResult', onLoginResult);
    return () => { socket.off('loginResult', onLoginResult); };
  }, [socket, navigate]);

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

  return <>
  
    <div className={styles.title}>Daclion Online</div>

    <div className={styles.loginContainer}>
      <div className={styles.label}>로그인</div>
      <label>
        <input type='text' name='id' ref={idRef} className={styles.inputId} placeholder='아이디'/>
      </label>
      <label>
        <input type='password' name='password' ref={pwRef} className={styles.inputPw} placeholder='비밀번호' />
      </label>
      { error && error.length > 0 ? <div className={styles.error}>{error}</div> : null }
      <button onClick={login}>로그인</button>
      <div className={styles.nav}>
        <Link to='/register'>회원가입</Link>
        <Link to='/register'>비밀번호 찾기</Link>
      </div>
    </div>
  </>;
}

export default Login
