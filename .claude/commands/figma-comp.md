Figma URL을 분석해서 React + Tailwind 컴포넌트와 Code Connect 파일을 구현해줘.

**Figma URL**: $ARGUMENTS

---

## 실행 순서

### 1단계: 규칙 파일 읽기

`docs/design-system/figma-component-rules.md` 를 읽고 프로젝트 컨벤션을 파악해.

### 2단계: Figma 분석

주어진 URL에서 fileKey와 nodeId를 추출한 뒤 아래 순서로 분석해.

1. **`get_metadata`** — variants 전체 목록 확인 (variant property 이름과 값 파악)
2. **`get_design_context`** — styleType별로 대표 variant를 fetch해서 색상 토큰과 레이아웃 구조 추출
   - styleType이 여러 개면 각각 따로 fetch (토큰이 다름)
   - size별 스펙(height, font-size, icon-size) 확인

### 3단계: 구현

`docs/design-system/figma-component-rules.md`의 규칙에 따라 아래 두 파일을 생성해.

**컴포넌트 위치**: `packages/ui-react/shared/ui/<component-name>/`

생성 파일:
- `<component-name>.tsx` — 컴포넌트 본체
- `index.tsx` — re-export
- `<component-name>.figma.ts` — Code Connect

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
