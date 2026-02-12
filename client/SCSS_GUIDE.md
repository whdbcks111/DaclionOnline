# SCSS 사용 가이드

## 📦 설치 완료

SCSS가 프로젝트에 적용되었습니다!

---

## 📁 파일 구조

```
client/src/
├── styles/
│   ├── variables.scss    # 변수 정의 (색상, 폰트, 간격 등)
│   ├── mixins.scss       # 재사용 가능한 스타일 함수
│   └── global.scss       # 전역 스타일
├── pages/
│   ├── Login.tsx
│   └── Login.module.scss # CSS Modules (컴포넌트 전용)
└── main.tsx              # global.scss import
```

---

## 🎨 SCSS 사용 방법

### 1️⃣ CSS Modules 방식 (권장)

컴포넌트별로 독립적인 스타일을 작성합니다.

**파일명: `Component.module.scss`**

```scss
// Login.module.scss
@import '../styles/variables.scss';
@import '../styles/mixins.scss';

.container {
  @include flex-center;
  background-color: $primary-color;
  padding: $spacing-lg;

  .title {
    color: $white;
    font-size: $font-size-xlarge;

    &:hover {
      color: $secondary-color;
    }
  }
}
```

**컴포넌트에서 사용:**

```tsx
import styles from './Login.module.scss'

function Login() {
  return (
    <div className={styles.container}>
      <h1 className={styles.title}>제목</h1>
    </div>
  )
}
```

### 2️⃣ 전역 SCSS 방식

모든 페이지에서 공통으로 사용하는 스타일

**파일명: `global.scss` 또는 일반 `.scss`**

```scss
// styles/global.scss
@import './variables.scss';

.button-primary {
  background-color: $primary-color;
  color: $white;
  padding: $spacing-md;
}
```

**컴포넌트에서 사용:**

```tsx
// main.tsx에서 이미 import되어 있으므로 바로 사용 가능
function MyComponent() {
  return <button className="button-primary">클릭</button>
}
```

---

## 🔧 SCSS 주요 기능

### 1. 변수 (Variables)

**정의:** `styles/variables.scss`
```scss
$primary-color: #3498db;
$spacing-md: 16px;
```

**사용:**
```scss
.box {
  background: $primary-color;
  padding: $spacing-md;
}
```

### 2. 중첩 (Nesting)

```scss
.nav {
  background: $dark-color;

  .navItem {
    color: $white;

    &:hover {
      color: $primary-color;
    }

    &.active {
      font-weight: bold;
    }
  }
}
```

### 3. Mixin (재사용 가능한 스타일)

**정의:** `styles/mixins.scss`
```scss
@mixin flex-center {
  display: flex;
  justify-content: center;
  align-items: center;
}

@mixin card {
  background: $white;
  border-radius: $border-radius-lg;
  box-shadow: $shadow-md;
  padding: $spacing-lg;
}
```

**사용:**
```scss
.container {
  @include flex-center;
}

.loginBox {
  @include card;
}
```

### 4. 반응형 디자인

**Mixin 사용:**
```scss
.container {
  padding: $spacing-lg;

  @include mobile {
    padding: $spacing-sm;
  }

  @include tablet {
    padding: $spacing-md;
  }
}
```

**결과:**
```css
.container {
  padding: 24px;
}

@media (max-width: 576px) {
  .container {
    padding: 8px;
  }
}
```

---

## 📝 실전 예제

### 예제 1: 버튼 컴포넌트

**Button.module.scss**
```scss
@import '../styles/variables.scss';
@import '../styles/mixins.scss';

.button {
  @include button-base;

  &.primary {
    background-color: $primary-color;
    color: $white;
  }

  &.secondary {
    background-color: $secondary-color;
    color: $white;
  }

  &.small {
    padding: $spacing-xs $spacing-sm;
    font-size: $font-size-small;
  }

  &.large {
    padding: $spacing-md $spacing-lg;
    font-size: $font-size-large;
  }
}
```

**Button.tsx**
```tsx
import styles from './Button.module.scss'

interface ButtonProps {
  variant?: 'primary' | 'secondary'
  size?: 'small' | 'large'
  children: React.ReactNode
}

function Button({ variant = 'primary', size, children }: ButtonProps) {
  const classes = [
    styles.button,
    variant && styles[variant],
    size && styles[size]
  ].filter(Boolean).join(' ')

  return <button className={classes}>{children}</button>
}
```

### 예제 2: 카드 컴포넌트

**Card.module.scss**
```scss
@import '../styles/variables.scss';
@import '../styles/mixins.scss';

.card {
  @include card;
  transition: transform $transition-base;

  &:hover {
    transform: translateY(-4px);
    box-shadow: $shadow-lg;
  }

  .cardHeader {
    font-size: $font-size-large;
    font-weight: 600;
    margin-bottom: $spacing-md;
    color: $dark-color;
  }

  .cardBody {
    color: lighten($dark-color, 20%);
    line-height: 1.6;
  }
}
```

---

## 🎯 변수 목록

### 색상
- `$primary-color`: #3498db (파란색)
- `$secondary-color`: #2ecc71 (초록색)
- `$danger-color`: #e74c3c (빨간색)
- `$warning-color`: #f39c12 (주황색)
- `$dark-color`: #2c3e50 (어두운색)
- `$light-color`: #ecf0f1 (밝은색)

### 간격
- `$spacing-xs`: 4px
- `$spacing-sm`: 8px
- `$spacing-md`: 16px
- `$spacing-lg`: 24px
- `$spacing-xl`: 32px
- `$spacing-xxl`: 48px

### Border Radius
- `$border-radius-sm`: 4px
- `$border-radius-md`: 8px
- `$border-radius-lg`: 12px
- `$border-radius-full`: 9999px (완전 둥글게)

### 그림자
- `$shadow-sm`: 작은 그림자
- `$shadow-md`: 중간 그림자
- `$shadow-lg`: 큰 그림자

---

## 💡 팁

### 1. 변수는 항상 import
```scss
@import '../styles/variables.scss';
@import '../styles/mixins.scss';
```

### 2. CSS Modules 사용 시 camelCase
```scss
.loginContainer { }  // ✅ 좋음
.login-container { } // ⚠️ 동작은 하지만 styles['login-container']로 접근해야 함
```

### 3. 전역 vs 모듈
- **전역**: 여러 곳에서 사용하는 공통 스타일
- **모듈**: 특정 컴포넌트에만 사용하는 스타일

### 4. 중첩은 3단계까지만
```scss
// ✅ 좋음
.nav {
  .item {
    &:hover { }
  }
}

// ❌ 나쁨 (너무 깊음)
.nav {
  .list {
    .item {
      .link {
        .icon { }
      }
    }
  }
}
```

---

## 🚀 다음 단계

1. `styles/variables.scss`에서 색상/간격 커스터마이징
2. 새 컴포넌트 만들 때 `.module.scss` 파일 생성
3. `mixins.scss`에 자주 사용하는 스타일 추가
4. 반응형 디자인 적용

즐거운 스타일링 되세요! 🎨
