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

### 3단계: 구현

`docs/design-system/figma-component-rules.md`의 규칙에 따라 아래 파일들을 생성해.

**컴포넌트 위치**: `packages/ui-react/shared/ui/<component-name>/`

생성 파일:
- `<component-name>.tsx` — 컴포넌트 본체
- `index.tsx` — re-export
- `<component-name>.figma.ts` — Code Connect

### 4단계: Storybook Story 생성

컴포넌트와 동일한 디렉토리에 `<component-name>.stories.tsx`를 생성해.

**Story 작성 규칙:**

1. **메타 설정**
   - `title`: `'Components/<ComponentName>'` 형식
   - `tags: ['autodocs']` — 자동 문서화 활성화
   - `parameters.layout: 'centered'`
   - `argTypes`: 각 prop에 적절한 control 타입 지정
     - enum prop → `control: 'select'`, `options: [...]`
     - boolean prop → `control: 'boolean'`
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

---

## 구현 체크리스트

- [ ] Props 인터페이스 — TypeScript, styleType/size enum 포함
- [ ] Slot props — ReactNode, 없으면 렌더 안 함 (`prop && <div>...</div>`)
- [ ] 편의 prop + slot 병행 — `actionSlot` 우선, 없으면 `onEdit`/`onRemove` 로 내부 버튼 렌더
- [ ] styleType별 토큰 맵 — clsx로 조건부 적용
- [ ] size별 스펙 맵 — height, padding, font, icon-size
- [ ] hover 상태 — CSS `:hover`만 사용, prop 없음
- [ ] disabled 상태 — `disabled?: boolean` prop
- [ ] 기존 내부 컴포넌트 재사용 — CheckBox는 `@dop-ui/react/shared/ui/check-box`, 아이콘은 `@tabler/icons-react`
- [ ] Code Connect — Figma nodeId 정확히 기입, props 매핑 완성
- [ ] Storybook — `Default`, styleType별, size별, `Disabled`, `AllVariants` Story 완성
