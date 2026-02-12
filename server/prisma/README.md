# Prisma 사용법

## CLI 명령어

```bash
# 스키마 변경 후 마이그레이션 생성 + 적용
npx prisma migrate dev --name 마이그레이션이름

# 마이그레이션 초기화 (데이터 전부 삭제됨)
npx prisma migrate reset --force

# Prisma Client 재생성 (타입 업데이트)
npx prisma generate

# DB를 웹 GUI로 확인/편집
npx prisma studio

# 기존 DB에서 스키마 자동 생성
npx prisma db pull

# 스키마를 DB에 바로 반영 (마이그레이션 없이)
npx prisma db push
```

## 스키마 정의 (schema.prisma)

```prisma
model User {
  id        Int      @id @default(autoincrement())
  username  String   @unique @db.VarChar(50)
  email     String   @unique @db.VarChar(100)
  password  String   @db.VarChar(255)
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("users")  // 실제 테이블명
}
```

### 주요 어노테이션

| 어노테이션 | 설명 |
|---|---|
| `@id` | 기본키 |
| `@default(autoincrement())` | 자동 증가 |
| `@unique` | 유니크 제약 |
| `@db.VarChar(50)` | DB 컬럼 타입 지정 |
| `@default(now())` | 기본값 현재 시간 |
| `@updatedAt` | 수정 시 자동 업데이트 |
| `@map("column_name")` | 실제 컬럼명 매핑 |
| `@@map("table_name")` | 실제 테이블명 매핑 |

## CRUD

```typescript
import prisma from '../config/prisma.js'
```

### 조회

```typescript
// 전체 조회
const users = await prisma.user.findMany()

// 조건 + 정렬 + 페이징
const users = await prisma.user.findMany({
  where: { username: 'daclion' },
  orderBy: { createdAt: 'desc' },
  take: 10,   // LIMIT
  skip: 0,    // OFFSET
})

// 단건 조회 (unique 필드만)
const user = await prisma.user.findUnique({
  where: { id: 1 }
})

// 단건 조회 (일반 조건)
const user = await prisma.user.findFirst({
  where: { username: 'daclion' }
})
```

### 생성

```typescript
const newUser = await prisma.user.create({
  data: {
    username: 'daclion',
    email: 'daclion@test.com',
    password: 'hashed_password'
  }
})
```

### 수정

```typescript
const updated = await prisma.user.update({
  where: { id: 1 },
  data: { username: 'newName' }
})
```

### 삭제

```typescript
await prisma.user.delete({
  where: { id: 1 }
})
```

## 필드 선택 (select)

```typescript
// 특정 필드만 가져오기 (비밀번호 제외 등)
const user = await prisma.user.findUnique({
  where: { id: 1 },
  select: {
    id: true,
    username: true,
    email: true,
  }
})
```

## 관계 (Relation)

### 스키마 정의

```prisma
model User {
  id    Int    @id @default(autoincrement())
  posts Post[]
  @@map("users")
}

model Post {
  id       Int    @id @default(autoincrement())
  title    String @db.VarChar(200)
  content  String @db.Text
  authorId Int    @map("author_id")
  author   User   @relation(fields: [authorId], references: [id])
  @@map("posts")
}
```

### 관계 포함 조회 (include)

```typescript
const user = await prisma.user.findUnique({
  where: { id: 1 },
  include: { posts: true }
})
// user.posts -> Post[]
```

## Where 조건 연산자

```typescript
await prisma.user.findMany({
  where: {
    username: { contains: 'dacl' },      // LIKE '%dacl%'
    email: { startsWith: 'admin' },      // LIKE 'admin%'
    id: { gt: 5 },                       // > 5
    id: { gte: 5 },                      // >= 5
    id: { lt: 10 },                      // < 10
    id: { in: [1, 2, 3] },              // IN (1, 2, 3)
    id: { not: 1 },                      // != 1
    OR: [                                // OR 조건
      { username: 'a' },
      { username: 'b' }
    ],
  }
})
```
