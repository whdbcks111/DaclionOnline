// ===========================
// 유효성 검사 유틸리티
// ===========================

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
