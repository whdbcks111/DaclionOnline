// 로그인 페이지
import { useState, useRef, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import styles from './Register.module.scss'
import { useSocket } from '../context/SocketContext';
import { validateEmail, validateId, validateNickname, validatePassword } from '../utils/validators';
import type { RegisterResult, SimpleResult } from '../shared/types';

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
        socket?.on('registerResult', (result: RegisterResult) => {
            if(result.ok) {
                document.cookie = `sessionToken=${result.sessionToken}; path=/; max-age=${60 * 60 * 24 * 7}`;
                navigate('/home');
            }
            else {
                setError(result.error ?? '오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
            }
        });

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

    return <>

        <div className={styles.registerContainer}>
            <div className={styles.label}>회원가입</div>
            <input type='text' name='id' ref={idRef} className={styles.inputField} placeholder='아이디' />
            <input type='email' name='email' ref={emailRef} className={styles.inputField} placeholder='이메일' />
            <button onClick={sendVerifyCode}>{isVerifyCodeSent ? '다시 전송' : '인증번호 발송'}</button>
            <div className={styles.verifyField}>
                <input type='text' name='verify-code' ref={verifyCodeRef} placeholder='인증번호 입력' />
                <button onClick={verifyInputCode}>인증번호 확인</button>
            </div>
            {isCodeVerified ? <div className={styles.ok}>인증번호 확인이 완료되었습니다.</div> : null}
            <input type='password' name='password' ref={pwRef} className={styles.inputField} placeholder='비밀번호' />
            <input type='password' name='password-confirm' ref={pwConfirmRef} className={styles.inputField} placeholder='비밀번호 확인' />
            <input type='text' name='nickname' ref={nicknameRef} className={styles.inputField} placeholder='닉네임' />
            {error && error.length > 0 ? <div className={styles.error}>{error}</div> : null}
            <button className={styles.registerBtn} onClick={register}>회원가입</button>
            <div className={styles.nav}>
                <Link to='/login'>로그인</Link>
            </div>
        </div>
    </>;
}

export default Register
