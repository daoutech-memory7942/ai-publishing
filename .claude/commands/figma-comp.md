Figma URL을 분석해서 React + Tailwind 컴포넌트와 Code Connect 파일을 구현해줘.

**Figma URL**: $ARGUMENTS

---

## 실행 순서

### 1단계: 규칙 파일 읽기

`docs/design-system/figma-component-rules.md` 를 읽고 프로젝트 컨벤션을 파악해.

### 2단계: Figma 분석

주어진 URL에서 fileKey와 nodeId를 추출한 뒤 아래 순서로 분석해.

1. **`get_metadata`** — variants 전체 목록 확인 (variant property 이름과 값 파악)
2. **`get_design_context`** — `disableCodeConnect: true` 옵션을 반드시 사용해서 실제 렌더링된 CSS 토큰 확인
   - styleType이 여러 개면 각각 따로 fetch (토큰이 다름)
   - **같은 styleType이라도 level에 따라 텍스트 토큰이 달라질 수 있으므로 styleType × level 조합별로 텍스트/배경/테두리 토큰을 각각 확인**
   - size별 스펙(height, font-size, icon-size) 확인

### 2.5단계: 타이포그래피 매핑 검증

`get_design_context` 응답 하단의 `"These styles are contained in the design:"` 메시지에서 Figma 타이포그래피 스타일명을 수집한다.

**변환 규칙**: `{Category}/{Size}/{Weight}` → `typo-{category}-{size}-{weight}`

- Category: `Heading` → `heading`, `Body` → `body`
- Size: 그대로 소문자 (`M` → `m`, `XL` → `xl`, `2XS` → `2xs`)
- Weight: `B` → `b`, `M` → `m`, `R` → `r`

예시: `Body/M/R` → `typo-body-m-r` / `Heading/S/B` → `typo-heading-s-b`

**검증 절차**:
1. 수집된 Figma 스타일명을 위 규칙으로 `typo-*` 클래스명으로 변환한다.
2. `src/typo.css`를 읽어 해당 클래스가 실제로 정의되어 있는지 확인한다.
3. **`typo.css`에 없는 클래스가 있으면 구현 전에 사용자에게 알리고 추가 여부를 결정**한다.
4. 구현 시 `font-size` / `font-weight` / `letter-spacing` / `line-height` 를 개별 Tailwind 임의값으로 쓰지 않고 **`typo-*` 단일 클래스**로 적용한다.

### 3단계: 구현

`docs/design-system/figma-component-rules.md`의 규칙에 따라 아래 파일들을 생성해.

**컴포넌트 위치**: `packages/ui-react/shared/ui/<component-name>/`

생성 파일:
- `<component-name>.tsx` — 컴포넌트 본체
- `index.tsx` — re-export
- `<component-name>.figma.ts` — Code Connect

#### Figma boolean property → React boolean prop 매핑 규칙

Figma의 boolean property(`hasIconLeft`, `hasCount`, `hasIconRight` 등 슬롯 표시 여부를 제어하는 것)는 **React 컴포넌트 props에도 boolean으로 그대로 노출**해야 한다.

**잘못된 패턴** — Code Connect 레이어에서 boolean을 ReactNode로 변환해서 소비:
```typescript
// ❌ Code Connect에서 흡수 → React props에 boolean이 사라짐
leftIcon: figma.boolean('hasIconLeft', { true: <span />, false: undefined })
```
이렇게 하면 React 컴포넌트는 `hasIconLeft: boolean` prop 없이 `leftIcon: ReactNode`만 갖게 되어, Storybook controls에 boolean 토글이 노출되지 않는다.

**올바른 패턴** — React prop에 boolean 유지, Code Connect도 boolean → boolean 직접 매핑:
```tsx
// ✅ React 컴포넌트 props
interface Props {
  hasIconLeft?: boolean;       // Storybook boolean 컨트롤로 토글 가능
  leftIcon?: React.ReactNode;  // 실제 아이콘 전달 (선택)
}

// ✅ 컴포넌트 내부 — undefined / true / false 를 명확히 구분
// - undefined : leftIcon 존재 여부로 fallback (하위호환)
// - true      : 항상 표시 (leftIcon 없으면 플레이스홀더)
// - false     : 항상 숨김 (leftIcon이 있어도 무시)
const showLeft = hasIconLeft === undefined ? !!leftIcon : hasIconLeft;

// ✅ 플레이스홀더 — 현재 텍스트 색의 outlined 박스 (시각적으로 식별 가능)
const IconPlaceholder = () => (
  <span className="inline-block w-4 h-4 rounded border-2 border-current" />
);

{showLeft && <span className="inline-flex shrink-0">{leftIcon ?? <IconPlaceholder />}</span>}
```
```typescript
// ✅ Code Connect — boolean → boolean 직접 매핑
hasIconLeft: figma.boolean('hasIconLeft', { true: true, false: undefined }),
```

> **주의**: `showX = hasX || !!xSlot` 패턴은 사용하지 않는다. `hasX=false`여도 `xSlot`이 있으면 표시되는 로직 버그가 발생한다.

**적용 대상**: `get_metadata` 결과에서 **property type이 `BOOLEAN`인 항목 전체**에 이 패턴을 적용한다. property 이름(`has*`, `show*` 등)이 아니라 **타입**으로 판단하므로, 이름과 관계없이 `BOOLEAN` 타입이면 React boolean prop으로 노출한다.

```
// get_metadata 응답 예시
"componentPropertyDefinitions": {
  "hasIconLeft": { "type": "BOOLEAN", "defaultValue": false },  // → boolean prop
  "iconVisible":  { "type": "BOOLEAN", "defaultValue": true },  // → boolean prop (이름과 무관)
  "label":        { "type": "TEXT",    "defaultValue": "Button" }, // → string prop
  "styleType":    { "type": "VARIANT", ... },                    // → enum prop
}
```

### 4단계: Storybook Story 생성

컴포넌트와 동일한 디렉토리에 `<component-name>.stories.tsx`를 생성해.

**Story 작성 규칙:**

1. **메타 설정**
   - `title`: `'Components/<ComponentName>'` 형식
   - `tags: ['autodocs']` — 자동 문서화 활성화
   - `parameters.layout: 'centered'`
   - `argTypes`: 각 prop에 적절한 control 타입 지정
     - enum prop → `control: 'select'`, `options: [...]`
     - boolean prop → `control: 'boolean'` (Figma boolean property에서 온 `has*` prop 포함)
     - string prop → `control: 'text'`
     - ReactNode slot → `control: false` (스토리에서 직접 구성)

2. **필수 Story 구성**
   - `Default` — 기본 상태 (가장 일반적인 props 조합)
   - styleType별 Story — 각 styleType을 개별 Story로 분리
   - size별 Story — size variant가 있으면 각각 분리
   - `Disabled` — disabled 상태
   - `AllVariants` — 모든 styleType × size 조합을 한 화면에 렌더링하는 갤러리 Story (`render` 함수로 구현)

3. **파일 포맷** (CSF3, `@storybook/react-vite` 기준)

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ComponentName } from './component-name';

const meta = {
  title: 'Components/ComponentName',
  component: ComponentName,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    styleType: { control: 'select', options: ['primary', 'secondary', ...] },
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    disabled: { control: 'boolean' },
  },
} satisfies Meta<typeof ComponentName>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { ... } };

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      {/* styleType × size 전체 조합 */}
    </div>
  ),
};
```

4. **ReactNode를 args에 넣지 않는다**

Storybook은 `args`를 JSON으로 직렬화한다. `leftIcon: <IconSearch />` 같은 ReactNode를 `args`에 포함하면 직렬화에 실패하면서 **해당 story의 args 전체가 깨진다** — `count`, `hasCount` 등 다른 props까지 컴포넌트에 전달되지 않는다.

**ReactNode prop이 있는 story는 반드시 `render` 함수를 사용한다.**

```tsx
// ❌ args에 ReactNode 포함 — 다른 args까지 깨짐
export const WithIcon: Story = {
  args: {
    label: 'Button',
    hasIconLeft: true,
    leftIcon: <IconSearch size={16} />,  // ← JSON 직렬화 불가
    count: '3',
    hasCount: true,  // ← leftIcon 때문에 이것도 전달 안 됨
  },
};

// ✅ render 함수로 ReactNode 분리 — args는 직렬화 가능한 값만
export const WithIcon: Story = {
  render: (args) => <ComponentName {...args} leftIcon={<IconSearch size={16} />} />,
  args: {
    label: 'Button',
    hasIconLeft: true,
    count: '3',
    hasCount: true,
  },
};
```

**적용 기준**: `leftIcon`, `rightIcon`, `leadingSlot`, `actionSlot` 등 `ReactNode` 타입 prop에 실제 JSX를 전달하는 story는 모두 `render` 함수 방식을 사용한다.

---

## 구현 체크리스트

- [ ] Props 인터페이스 — TypeScript, styleType/size enum 포함
- [ ] Figma boolean property → React boolean prop 직접 노출 — `has*` boolean을 Code Connect에서 ReactNode로 변환하지 말 것. React props에 boolean 그대로 유지하고 Code Connect도 `boolean → boolean` 매핑
- [ ] Slot props — ReactNode, 없으면 렌더 안 함. boolean prop과 병행 시 `showX = hasX === undefined ? !!xSlot : hasX` 패턴 적용 (`||` 금지 — `false`가 xSlot에 의해 무시됨)
- [ ] 편의 prop + slot 병행 — `actionSlot` 우선, 없으면 `onEdit`/`onRemove` 로 내부 버튼 렌더
- [ ] styleType별 토큰 맵 — clsx로 조건부 적용
- [ ] size별 스펙 맵 — height, padding, font, icon-size
- [ ] 타이포그래피 — `typo-*` 클래스 사용, 개별 font-size/weight/tracking 임의값 금지
- [ ] hover 상태 — CSS `:hover`만 사용, prop 없음
- [ ] disabled 상태 — `disabled?: boolean` prop
- [ ] 기존 내부 컴포넌트 재사용 — CheckBox는 `@dop-ui/react/shared/ui/check-box`, 아이콘은 `@tabler/icons-react`
- [ ] Code Connect — Figma nodeId 정확히 기입, props 매핑 완성
- [ ] Storybook — `Default`, styleType별, size별, `Disabled`, `AllVariants` Story 완성
- [ ] Storybook ReactNode args 금지 — `leftIcon`, `rightIcon`, slot 등 ReactNode를 args에 직접 넣지 않음. 해당 story는 `render: (args) => <Component {...args} leftIcon={<Icon />} />` 패턴으로 작성
