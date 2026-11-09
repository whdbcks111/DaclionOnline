// 로그인 페이지
import { useState, useRef, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import styles from './AuthLayout.module.scss'
import AuthLayout from './AuthLayout'
import { useSocket } from '../context/SocketContext';
import { validateEmail, validateId, validateNickname, validatePassword } from '../utils/validators';
import type { RegisterResult, SimpleResult } from '@shared/types';

function Register() {
    const navigate = useNavigate();
    const { socket, isConnected } = useSocket();

    const idRef = useRef<HTMLInputElement>(null);
    const emailRef = useRef<HTMLInputElement>(null);
    const pwRef = useRef<HTMLInputElement>(null);
    const nicknameRef = useRef<HTMLInputElement>(null);
    const verifyCodeRef = useRef<HTMLInputElement>(null);
    const pwConfirmRef = useRef<HTMLInputElement>(null);

    const [error, setError] = useState('');
    const [isCodeVerified, setCodeVerified] = useState(false);
    const [isVerifyCodeSent, setVerifyCodeSent] = useState(false);

    useEffect(() => {
        const onRegister = (result: RegisterResult) => {
            if(result.ok && result.sessionToken) {
                document.cookie = `sessionToken=${result.sessionToken}; path=/; max-age=${60 * 60 * 24 * 7}`;
                // 현재 연결은 가입 전에 시작되어 새 쿠키를 모른다. 재연결해 포털 세션을 복원한다.
                socket?.disconnect().connect();
                navigate('/');
            }
            else {
                setError(result.error ?? '오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
            }
        };
        socket?.on('registerResult', onRegister);

        socket?.on('verifyCodeSendResult', (result: SimpleResult) => {
            if(result.ok) {
                setVerifyCodeSent(true);
            }
            else {
                setError(result.error ?? '오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
            }
        });

        socket?.on('verifyCodeResult', (result: SimpleResult) => {
            if(result.ok) {
                setCodeVerified(true);
            }
            else {
                setError(result.error ?? '오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
            }
        });

        return () => {
            socket?.off('registerResult', onRegister);
            socket?.off('verifyCodeSendResult');
            socket?.off('verifyCodeResult');
        }
    }, [socket, isConnected]);

    const sendVerifyCode = () => {
        if (!isConnected || !socket) {
            setError('서버가 원활하지 않습니다. 잠시 후 다시 시도해주세요.');
            return;
        }

        const email = emailRef.current?.value ?? '';
        const emailValidateResult = validateEmail(email);
        if (emailValidateResult) {
            setError(emailValidateResult);
            return;
        }

        socket.emit('sendVerifyCode', email);
    }

    const verifyInputCode = () => {
        if (!isConnected || !socket) {
            setError('서버가 원활하지 않습니다. 잠시 후 다시 시도해주세요.');
            return;
        }
        
        const inputVerifyCode = verifyCodeRef.current?.value ?? '';

        socket.emit('verifyCode', inputVerifyCode);
    }

    const register = () => {
        const id = idRef.current?.value ?? '';
        const email = emailRef.current?.value ?? '';
        const pw = pwRef.current?.value ?? '';
        const pwConfirm = pwConfirmRef.current?.value ?? '';
        const nickname = nicknameRef.current?.value ?? '';

        const idValidateResult = validateId(id);
        if (idValidateResult) {
            setError(idValidateResult);
            return;
        }

        const emailValidateResult = validateEmail(email);
        if (emailValidateResult) {
            setError(emailValidateResult);
            return;
        }

        if (!isCodeVerified) {
            setError('이메일 인증이 완료되지 않았습니다.');
            return;
        }

        const pwValidateResult = validatePassword(pw);
        if (pwValidateResult) {
            setError(pwValidateResult);
            return;
        }

        if (pw !== pwConfirm) {
            setError('비밀번호가 일치하지 않습니다.');
            return;
        }

        const nicknameValidateResult = validateNickname(nickname);
        if (nicknameValidateResult) {
            setError(nicknameValidateResult);
            return;
        }

        if (isConnected && socket) {
            setError('');
            socket.emit('register', {
                id,
                pw,
                email,
                nickname
            });
            return;
        }

        setError('서버가 원활하지 않습니다. 잠시 후 다시 시도해주세요.');
    }

    return <AuthLayout title="계정 만들기"
        footer={<p>이미 계정이 있나요? <Link to='/login'>로그인</Link></p>}>
        <form className={styles.form} onSubmit={event => { event.preventDefault(); register(); }}>
            <div className={styles.field}>
                <label htmlFor="register-id">아이디</label>
                <input id="register-id" type="text" name="username" ref={idRef} placeholder="영문·숫자·밑줄 4~20자" autoComplete="username" required />
            </div>
            <div className={styles.field}>
                <label htmlFor="register-email">이메일</label>
                <div className={styles.inline}>
                    <input id="register-email" type="email" name="email" ref={emailRef} placeholder="you@example.com" autoComplete="email" required
                        onChange={() => {
                            setCodeVerified(false); setVerifyCodeSent(false);
                            if (verifyCodeRef.current) verifyCodeRef.current.value = '';
                        }} />
                    <button className={styles.secondary} type="button" onClick={sendVerifyCode} disabled={!isConnected || isCodeVerified}>{isVerifyCodeSent ? '다시 받기' : '인증번호 받기'}</button>
                </div>
            </div>
            {isVerifyCodeSent && !isCodeVerified && <div className={styles.field}>
                <label htmlFor="register-code">이메일 인증번호</label>
                <div className={styles.inline}>
                    <input id="register-code" type="text" name="verification-code" ref={verifyCodeRef} inputMode="numeric" maxLength={6} autoComplete="one-time-code" placeholder="6자리 인증번호" />
                    <button className={styles.secondary} type="button" onClick={verifyInputCode} disabled={!isConnected}>확인</button>
                </div>
            </div>}
            {isCodeVerified && <p className={styles.ok} role="status">이메일 인증을 완료했어요.</p>}
            <div className={styles.field}>
                <label htmlFor="register-password">비밀번호</label>
                <input id="register-password" type="password" name="password" ref={pwRef} placeholder="영문을 포함한 8~30자" autoComplete="new-password" required />
            </div>
            <div className={styles.field}>
                <label htmlFor="register-confirm">비밀번호 확인</label>
                <input id="register-confirm" type="password" name="password-confirm" ref={pwConfirmRef} placeholder="비밀번호를 한 번 더 입력해주세요" autoComplete="new-password" required />
            </div>
            <div className={styles.field}>
                <label htmlFor="register-nickname">포털 닉네임</label>
                <input id="register-nickname" type="text" name="nickname" ref={nicknameRef} placeholder="GAME BOX에서 사용할 이름" maxLength={12} autoComplete="nickname" required />
            </div>
            {error && <p className={styles.error} role="alert">{error}</p>}
            <button className={styles.submit} type="submit" disabled={!isConnected}>GAME BOX 시작하기</button>
        </form>
    </AuthLayout>;
}

export default Register
