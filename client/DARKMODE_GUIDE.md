# 다크모드 구현 가이드

## 📦 구현 완료

다크모드가 완전히 적용되었습니다!

---

## 📁 생성된 파일

### 1️⃣ **Context**
- **[client/src/context/ThemeContext.tsx](src/context/ThemeContext.tsx)** - 테마 상태 관리

### 2️⃣ **컴포넌트**
- **[client/src/components/ThemeToggle.tsx](src/components/ThemeToggle.tsx)** - 토글 버튼
- **[client/src/components/ThemeToggle.module.scss](src/components/ThemeToggle.module.scss)** - 토글 버튼 스타일

### 3️⃣ **스타일**
- **[client/src/styles/themes.scss](src/styles/themes.scss)** - 라이트/다크 테마 색상 정의

---

## 🎨 작동 방식

### 1. CSS Variables (CSS 변수)

```scss
// themes.scss
:root[data-theme='light'] {
  --color-background: #ffffff;
  --color-text: #2c3e50;
}

:root[data-theme='dark'] {
  --color-background: #1a1a2e;
  --color-text: #e8e8e8;
}
```

### 2. React Context (상태 관리)

```tsx
// ThemeContext.tsx
export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('light')

  useEffect(() => {
    // DOM에 data-theme 속성 설정
    document.documentElement.setAttribute('data-theme', theme)
    // localStorage에 저장 (새로고침 후에도 유지)
    localStorage.setItem('theme', theme)
  }, [theme])
}
```

### 3. 자동 적용

- 페이지 로드 시 localStorage에서 저장된 테마 불러오기
- `data-theme` 속성 변경 → CSS 변수 자동 변경
- 모든 컴포넌트 스타일 자동 업데이트

---

## 🚀 사용 방법

### 1️⃣ 컴포넌트에서 테마 사용

```tsx
import { useTheme } from '../context/ThemeContext'

function MyComponent() {
  const { theme, toggleTheme, setTheme } = useTheme()

  return (
    <div>
      <p>현재 테마: {theme}</p>

      {/* 토글 */}
      <button onClick={toggleTheme}>
        테마 전환
      </button>

      {/* 직접 설정 */}
      <button onClick={() => setTheme('dark')}>
        다크모드
      </button>
    </div>
  )
}
```

### 2️⃣ SCSS에서 테마 색상 사용

```scss
@import '../styles/themes.scss';

.myComponent {
  // CSS 변수 사용 (자동으로 테마에 따라 변경됨)
  background-color: $color-bg;
  color: $color-text;
  border: 1px solid $color-border;
}

.card {
  background: $color-card-bg;
  box-shadow: $shadow-md;
}
```

---

## 🎨 사용 가능한 테마 변수

### 배경색
```scss
$color-bg                    // 메인 배경
$color-bg-secondary          // 서브 배경
$color-bg-tertiary           // 3차 배경
```

### 텍스트 색상
```scss
$color-text                  // 메인 텍스트
$color-text-secondary        // 서브 텍스트
$color-text-tertiary         // 3차 텍스트 (회색)
$color-text-inverse          // 반전 색상 (버튼 등)
```

### 주요 색상
```scss
$color-primary               // 주 색상 (파란색)
$color-secondary             // 보조 색상 (초록색)
$color-danger                // 위험 (빨간색)
$color-warning               // 경고 (주황색)
```

### 컴포넌트
```scss
$color-card-bg               // 카드 배경
$color-input-bg              // 입력 필드 배경
$color-input-border          // 입력 필드 테두리
$color-border                // 일반 테두리
$color-border-light          // 밝은 테두리
```

### 그림자
```scss
$shadow-sm                   // 작은 그림자
$shadow-md                   // 중간 그림자
$shadow-lg                   // 큰 그림자
```

---

## 🎯 색상 커스터마이징

### themes.scss 수정

```scss
// 라이트 모드 색상 변경
:root[data-theme='light'] {
  --color-primary: #your-color;
  --color-background: #your-bg;
}

// 다크 모드 색상 변경
:root[data-theme='dark'] {
  --color-primary: #your-dark-color;
  --color-background: #your-dark-bg;
}
```

---

## 💡 고급 사용법

### 1. 조건부 스타일링

```tsx
import { useTheme } from '../context/ThemeContext'

function MyComponent() {
  const { theme } = useTheme()

  return (
    <div style={{
      background: theme === 'dark' ? '#000' : '#fff'
    }}>
      내용
    </div>
  )
}
```

### 2. 시스템 테마 감지 (선택사항)

```tsx
// ThemeContext.tsx에 추가 가능
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)')

const [theme, setTheme] = useState(() => {
  const saved = localStorage.getItem('theme')
  if (saved) return saved
  return prefersDark.matches ? 'dark' : 'light'
})
```

### 3. 특정 페이지만 다크모드

```tsx
function SpecialPage() {
  const { setTheme } = useTheme()

  useEffect(() => {
    setTheme('dark')
    return () => setTheme('light') // 페이지 나갈 때 복원
  }, [])
}
```

---

## 🔧 토글 버튼 위치 변경

```scss
// ThemeToggle.module.scss
.themeToggle {
  position: fixed;

  // 우측 상단 (기본)
  top: 24px;
  right: 24px;

  // 좌측 상단으로 변경하려면:
  // top: 24px;
  // left: 24px;

  // 우측 하단으로 변경하려면:
  // bottom: 24px;
  // right: 24px;
}
```

---

## ✅ 체크리스트

- [x] ThemeContext 생성 및 Provider 적용
- [x] CSS 변수로 테마 색상 정의
- [x] localStorage에 테마 저장 (새로고침 후에도 유지)
- [x] 토글 버튼 컴포넌트 생성
- [x] 전역 스타일에 테마 적용
- [x] Login 페이지 다크모드 지원

---

## 🎨 예제: 새 컴포넌트에 다크모드 적용

```scss
// MyComponent.module.scss
@import '../styles/themes.scss';

.container {
  background: $color-card-bg;
  color: $color-text;
  border: 1px solid $color-border;

  .title {
    color: $color-primary;
  }

  .description {
    color: $color-text-secondary;
  }
}
```

이제 자동으로 라이트/다크 모드가 적용됩니다! 🌙☀️
