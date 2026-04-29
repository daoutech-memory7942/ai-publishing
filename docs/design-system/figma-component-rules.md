# Figma → React 컴포넌트 구현 규칙

이 문서는 Figma 디자인을 React + Tailwind 컴포넌트로 구현할 때 적용되는 프로젝트 공통 규칙이다.

---

## 프로젝트 구조

### 컴포넌트 위치

신규 컴포넌트는 아래 패키지에 생성한다.

```
packages/ui-react/shared/ui/<component-name>/
  <component-name>.tsx   ← 컴포넌트 본체
  index.tsx              ← re-export
  <component-name>.figma.ts  ← Code Connect
```

### 주요 패키지 경로

| 패키지 이름 | 경로 | 용도 |
|---|---|---|
| `@dop-ui/react` | `packages/ui-react` | 신규 공통 컴포넌트 |
| `@daouoffice/ui` | `packages/ui` | 레거시 컴포넌트 (deprecated) |
| `@daouoffice/tailwindcss` | `packages/tailwindcss` | Tailwind 설정 |
| `@daouoffice/design` | `design/` | 디자인 토큰 CSS |

### 컴포넌트 참조 우선순위

신규 컴포넌트 구현 시 내부 의존 컴포넌트는 아래 순서로 사용한다.

1. `@dop-ui/react/shared/ui/<component>` (신규)
2. `@daouoffice/ui` (레거시, deprecated 주석 확인 후 사용)

---

## 기술 스택

- **언어**: TypeScript
- **프레임워크**: React 19
- **스타일링**: Tailwind CSS + CSS 변수(디자인 토큰)
- **클래스 병합**: `clsx`
- **아이콘**: `@tabler/icons-react`

---

## Tailwind 사용 규칙

### 디자인 토큰은 CSS 변수로 참조

```tsx
// 올바른 방법 - CSS 변수 사용
className="bg-[var(--basic/bg/level2)] text-[var(--basic/text/level1)]"

// 피해야 할 방법 - 하드코딩
className="bg-[#f8f8f8] text-[#1c1c1c]"
```

### 텍스트 컬러 클래스 규칙 (Tailwind v4)

`text-(--var)` shorthand는 Tailwind v4에서 `color` / `font-size` 중 어느 property인지 모호할 때 CSS를 생성하지 않아 텍스트가 검은색으로 출력된다.

- `bg-(--var)`, `border-(--var)` — 타입이 하나라 shorthand 사용 가능
- `text-(--var)` — **컬러 용도로 사용 금지**

텍스트 컬러는 `theme.css`의 `@theme`에 `--color-*` 형태로 등록된 토큰명을 직접 사용한다.

```tsx
// ❌ 동작 안 함 (타입 모호, CSS 미생성)
className="text-(--button-text-level1)"

// ✅ @theme 등록 토큰명 사용 (--color- 접두사를 제거한 이름)
className="text-button-text-level1"
```

### 타이포그래피는 `typo-*` 컴포넌트 클래스 사용

`font-size` / `font-weight` / `letter-spacing` / `line-height`를 개별 Tailwind 임의값으로 분산하지 않는다. `src/typo.css`의 `@layer components`에 정의된 `typo-*` 단일 클래스로 처리한다.

```tsx
// ❌ 개별 임의값 — 4개 속성 분산
className="text-[14px] font-medium tracking-[-0.28px] leading-4.5"

// ✅ typo-* 클래스 — 1개로 통합
className="typo-body-m-m"
```

**Figma → typo 클래스 변환 규칙**

`get_design_context` 응답의 `"These styles are contained in the design:"` 줄에서 `{Category}/{Size}/{Weight}` 형태 스타일명을 확인한 뒤 아래 표로 변환한다.

| Figma 스타일 | typo 클래스 | Figma 스타일 | typo 클래스 |
|---|---|---|---|
| Heading/3XL/B | `typo-heading-3xl-b` | Body/L/M | `typo-body-l-m` |
| Heading/3XL/M | `typo-heading-3xl-m` | Body/L/R | `typo-body-l-r` |
| Heading/2XL/B | `typo-heading-2xl-b` | Body/M/B | `typo-body-m-b` |
| Heading/2XL/M | `typo-heading-2xl-m` | Body/M/M | `typo-body-m-m` |
| Heading/XL/B | `typo-heading-xl-b` | Body/M/R | `typo-body-m-r` |
| Heading/XL/M | `typo-heading-xl-m` | Body/S/M | `typo-body-s-m` |
| Heading/L/B | `typo-heading-l-b` | Body/S/R | `typo-body-s-r` |
| Heading/L/M | `typo-heading-l-m` | Body/XS/M | `typo-body-xs-m` |
| Heading/M/B | `typo-heading-m-b` | Body/XS/R | `typo-body-xs-r` |
| Heading/M/M | `typo-heading-m-m` | Body/2XS/R | `typo-body-2xs-r` |
| Heading/S/B | `typo-heading-s-b` | | |
| Heading/S/M | `typo-heading-s-m` | | |

> 변환된 클래스가 `typo.css`에 없으면 구현 전에 사용자에게 알리고 추가 여부를 결정한다.

### clsx로 조건부 클래스 처리

```tsx
import { clsx } from 'clsx';

className={clsx(
  'base-classes',
  variant === 'emphasis' && 'bg-[var(--blue/03)]',
  disabled && 'opacity-50 pointer-events-none',
  className,
)}
```

---

## 주요 디자인 토큰 목록

### 색상 토큰

| 토큰 | 역할 |
|---|---|
| `--basic/bg/level2` | 기본 배경 (칩, 카드 등) |
| `--basic/bg/level3` | hover 배경 |
| `--basic/border/level7` | 기본 테두리 |
| `--basic/border/level6` | 구분선(divider) |
| `--basic/text/level1` | 기본 텍스트 (진함) |
| `--basic/text/level3` | 보조 텍스트 (흐림) |
| `--basic/icon/level1` | 기본 아이콘 색 |
| `--basic/icon/level3` | 보조 아이콘 색 |
| `--blue/03` | 강조(emphasis) 배경 |
| `--blue/10` | 강조(emphasis) 구분선 |

### 스페이싱 토큰

| 토큰 | 값 | 용도 |
|---|---|---|
| `--doa-space/4xs` | 2px | 텍스트 패딩 |
| `--doa-space/3xs` | 4px | 아이콘 gap |
| `--doa-space/2xs` | 6px | xs 사이즈 패딩 |
| `--doa-space/xs` | 8px | m/s 사이즈 패딩 |
| `--doa-space/m` | 16px | pill border-radius |

### 폰트 토큰

| 토큰 | 사이즈 | 용도 |
|---|---|---|
| `--font-size/body-m` | 14px | size=m 텍스트 |
| `--font-size/body-s` | 13px | size=s 텍스트 |
| `--font-size/body-xs` | 12px | size=xs 텍스트 |
| `--line-height/body-m` | 18px | |
| `--letter-spacing/body-m` | -0.28px | |

### 반경 토큰

| 토큰 | 값 | 용도 |
|---|---|---|
| `--doa-radius/2xs` | 4px | 버튼 아이콘 |
| `--doa-radius/xs` | 6px | 작은 버튼 |

---

## Props 설계 원칙

### Slot은 ReactNode prop으로 처리

Figma의 named slot(`leadingSlot`, `iconStackSlot`, `actionSlot` 등)은 `ReactNode` prop으로 매핑한다.

```tsx
interface Props {
  leadingSlot?: React.ReactNode
  iconStackSlot?: React.ReactNode
  actionSlot?: React.ReactNode   // 커스텀 전체 교체
}
```

### 편의 prop + slot 병행 (Option B 패턴)

자주 쓰이는 액션은 편의 prop으로도 제공한다. `actionSlot`이 있으면 편의 prop보다 우선 적용.

```tsx
interface Props {
  onEdit?: () => void       // 편연필 아이콘 버튼 노출
  onRemove?: () => void     // X 아이콘 버튼 노출
  actionSlot?: React.ReactNode  // 완전 커스텀 (우선 적용)
}
```

### prop 있으면 노출, 없으면 숨김

boolean flag prop 대신, prop 자체의 존재 여부로 표시를 제어한다.

```tsx
// 올바른 방법
{leadingSlot && <div className="...">{leadingSlot}</div>}

// 피해야 할 방법
{hasLeading && <div className="...">{leadingSlot}</div>}
```

### count prop — 괄호는 컴포넌트가 래핑

`count` prop은 숫자/문자열 값만 받고, 괄호는 컴포넌트 내부에서 렌더링 시 추가한다.

```tsx
// Props 타입
interface Props {
  count?: string;  // 값만 전달: "3", "99+"
}

// 렌더링
<span>({count})</span>  // → "(3)", "(99+)"

// 사용 예
<ButtonBasic count="3" hasCount />   // 렌더: (3)
<ButtonBasic count="99+" hasCount /> // 렌더: (99+)
```

**Figma에서 count 기본값이 `"(0)"` 형태로 보이더라도 괄호를 값에 포함하지 않는다.**  
괄호는 항상 컴포넌트가 추가하므로 `count="0"`으로 전달한다.

### Variants는 enum 타입으로

```tsx
type ChipStyleType = 'default' | 'subtle' | 'emphasis'
type ChipSize = 'm' | 's' | 'xs'
```

---

## Figma Variants → Props 매핑 규칙

| Figma property | React prop | 비고 |
|---|---|---|
| `styleType` | `styleType` | enum 그대로 매핑 |
| `size` | `size` | enum 그대로 매핑 |
| `state=hover` | CSS `:hover` | prop 불필요, CSS만 처리 |
| `state=disabled` | `disabled?: boolean` | |
| `hasXxx=true/false` | prop 존재 여부로 제어 | boolean flag prop 지양 |

---

## Code Connect 작성 규칙

### 파일 위치

컴포넌트와 같은 디렉터리에 `.figma.ts` 확장자로 생성.

```
<component-name>.tsx
<component-name>.figma.ts  ← 여기
```

### Figma 프로젝트 정보

- **fileKey**: `CneiAuBjY768PnyW0OkmIo`
- **파일명**: DDS Next_Web_v2

### 기본 템플릿

```typescript
import figma from '@figma/code-connect'
import { ComponentName } from './component-name'

figma.connect(ComponentName, 'https://www.figma.com/design/CneiAuBjY768PnyW0OkmIo?node-id=XXXXX-XXXXX', {
  props: {
    label:      figma.string('label'),
    styleType:  figma.enum('styleType', {
                  default:  'default',
                  subtle:   'subtle',
                  emphasis: 'emphasis',
                }),
    size:       figma.enum('size', { m: 'm', s: 's', xs: 'xs' }),
    // boolean prop: true면 값 전달, false면 undefined
    checked:    figma.boolean('hasCheckBox', { true: true, false: undefined }),
    // slot: true면 placeholder ReactNode, false면 undefined
    leadingSlot: figma.boolean('hasLeading', { true: <span />, false: undefined }),
    onRemove:    figma.boolean('hasAction',  { true: () => {}, false: undefined }),
  },
  example: (props) => <ComponentName {...props} />,
})
```

---

## 분석 프로세스

Figma URL이 주어졌을 때 아래 순서로 분석한다.

1. **`get_metadata`** — variants 전체 목록 파악 (variant property 이름·값 확인)
2. **`get_design_context`** — `disableCodeConnect: true` 옵션 필수 사용 (실제 CSS 토큰 확인용)
   - styleType별로 색상 토큰이 다를 경우 각각 fetch
   - **같은 styleType이라도 level에 따라 텍스트 토큰이 달라질 수 있으므로 styleType × level 조합별로 텍스트/배경/테두리 토큰을 각각 확인**
   - size별 스펙(height, font, icon size) 확인
3. **분석 결과 정리**
   - Props 인터페이스 도출
   - styleType/size별 토큰 맵 작성
   - slot 구조 확인
4. **구현** — 컴포넌트 + Code Connect 파일 생성
