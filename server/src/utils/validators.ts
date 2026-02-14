// ===========================
// 유효성 검사 유틸리티
// ===========================

// 소켓 데이터 구조 검증: 객체인지, 필드별 타입이 일치하는지
// 타입 뒤에 ?를 붙이면 옵셔널 (undefined 허용)
// 사용 예: isValidPayload(data, { id: 'string', pw: 'string', bio: 'string?' })
type FieldType = 'string' | 'number' | 'boolean' | 'string?' | 'number?' | 'boolean?'
export function isValidPayload(data: unknown, schema: Record<string, FieldType>): boolean {
    if (typeof data !== 'object' || data === null) return false;
    const obj = data as Record<string, unknown>;
    return Object.entries(schema).every(([key, type]) => {
        const optional = type.endsWith('?');
        const baseType = optional ? type.slice(0, -1) : type;
        return (optional && obj[key] === undefined) || typeof obj[key] === baseType;
    });
}

// 아이디 검증 
export function validateId(id: string): string | null {
  if (!id || id.trim().length === 0) return '아이디를 입력해주세요.'
  if (id.length < 4) return '아이디는 4자 이상이어야 합니다.'
  if (id.length > 20) return '아이디는 20자 이하여야 합니다.'
  if (!/^[a-zA-Z0-9_]+$/.test(id)) return '아이디는 영문, 숫자, 언더스코어만 가능합니다.'
  if (!/[a-zA-Z]/.test(id)) return '아이디에 최소 하나의 영문자가 포함되어야 합니다.'
  return null // 통과
}

// 비밀번호 검증
export function validatePassword(pw: string): string | null {
  if (!pw || pw.trim().length === 0) return '비밀번호를 입력해주세요.'
  if (pw.length < 8) return '비밀번호는 8자 이상이어야 합니다.'
  if (pw.length > 30) return '비밀번호는 30자 이하여야 합니다.'
  if (!/[a-zA-Z]/.test(pw)) return '비밀번호에 최소 하나의 영문자가 포함되어야 합니다.'
  return null // 통과
}

// 이메일 검증
export function validateEmail(email: string): string | null {
  if (!email || email.trim().length === 0) return '이메일을 입력해주세요.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '올바른 이메일 형식이 아닙니다.'
  return null
}

// 닉네임 검증
export function validateNickname(nickname: string): string | null {
  if (!nickname || nickname.trim().length === 0) return '닉네임을 입력해주세요.'
  if (nickname.length > 12) return '닉네임은 12자 이하여야 합니다.'
  if (!/^[가-힣a-zA-Z0-9_]+$/.test(nickname)) return '닉네임은 한글, 영문, 숫자, 언더스코어만 가능합니다.'
  return null
}
