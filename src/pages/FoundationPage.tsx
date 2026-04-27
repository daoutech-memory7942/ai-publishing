import { useLayoutEffect, useRef, useState } from 'react'
import themeCss from '../theme.css?raw'

// ── 토큰 파싱 ──────────────────────────────────────────────────

interface Token {
  colorVar: string  // --color-button-bg-base (표시용)
  cssVar: string    // --button-bg-base (실제 CSS 변수 참조용)
}

interface Group {
  category: string
  tokens: Token[]
}

function buildGroups(): Group[] {
  const lineRe = /^\s*(--color-[\w-]+)\s*:/gm
  const groups = new Map<string, Token[]>()
  let m
  while ((m = lineRe.exec(themeCss)) !== null) {
    const colorVar = m[1]
    // --color-button-bg-base → --button-bg-base
    const cssVar = colorVar.replace('--color-', '--')
    const category = colorVar.replace('--color-', '').split('-')[0]
    if (!groups.has(category)) groups.set(category, [])
    groups.get(category)!.push({ colorVar, cssVar })
  }
  return Array.from(groups.entries()).map(([category, tokens]) => ({ category, tokens }))
}

const GROUPS = buildGroups()
const TOTAL = GROUPS.reduce((s, g) => s + g.tokens.length, 0)

// ── 컴포넌트 ──────────────────────────────────────────────────

function Swatch({ colorVar, cssVar }: Token) {
  const label = colorVar.replace('--color-', '')
  return (
    <div className="flex flex-col gap-1">
      <div
        title={cssVar}
        style={{
          height: 40,
          borderRadius: 6,
          border: '1px solid var(--basic-border-level7)',
          backgroundColor: `var(${cssVar})`,
        }}
      />
      <p
        style={{ color: 'var(--basic-text-level4)', fontSize: 10 }}
        className="break-all leading-tight"
      >
        {label}
      </p>
    </div>
  )
}

function CategorySection({ category, tokens }: Group) {
  return (
    <section>
      <h2
        style={{
          color: 'var(--basic-text-level2)',
          borderColor: 'var(--basic-border-level7)',
        }}
        className="text-sm font-semibold mb-3 pb-1 border-b uppercase tracking-wide"
      >
        {category}
        <span style={{ color: 'var(--basic-text-level4)' }} className="ml-2 text-xs font-normal">
          {tokens.length}
        </span>
      </h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
        {tokens.map((t) => (
          <Swatch key={t.colorVar} {...t} />
        ))}
      </div>
    </section>
  )
}

// 다크모드 아이콘
function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

export default function FoundationPage() {
  const [isDark, setIsDark] = useState(false)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // 레이아웃 페인트 전 속성 적용 → 깜빡임 없음
  useLayoutEffect(() => {
    wrapperRef.current?.setAttribute('data--Color', isDark ? 'Dark' : 'Light')
  }, [isDark])

  const visible = activeCategory
    ? GROUPS.filter((g) => g.category === activeCategory)
    : GROUPS

  return (
    <div
      ref={wrapperRef}
      style={{ minHeight: '100vh', backgroundColor: 'var(--basic-bg-level2)' }}
    >
      {/* 헤더 */}
      <header
        style={{
          backgroundColor: 'var(--basic-bg-base)',
          borderColor: 'var(--basic-border-level7)',
        }}
        className="sticky top-0 z-10 border-b px-6 py-3 flex flex-wrap items-center gap-3"
      >
        <span style={{ color: 'var(--basic-text-level1)' }} className="font-semibold text-sm">
          Color Foundation
        </span>
        <span style={{ color: 'var(--basic-text-level4)' }} className="text-xs">
          {TOTAL} tokens
        </span>

        {/* 카테고리 탭 */}
        <div className="flex gap-1 flex-wrap">
          {[null, ...GROUPS.map((g) => g.category)].map((cat) => {
            const isActive = activeCategory === cat
            return (
              <button
                key={cat ?? 'all'}
                onClick={() => setActiveCategory(cat)}
                style={{
                  backgroundColor: isActive ? 'var(--basic-bg-inverse)' : 'transparent',
                  color: isActive ? 'var(--basic-text-on-bg)' : 'var(--basic-text-level3)',
                }}
                className="px-2.5 py-1 rounded text-xs font-medium transition-colors"
              >
                {cat ?? 'All'}
              </button>
            )
          })}
        </div>

        {/* 다크모드 토글 */}
        <button
          onClick={() => setIsDark((d) => !d)}
          title={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
          style={{
            backgroundColor: 'var(--basic-bg-level3)',
            color: 'var(--basic-text-level1)',
            borderColor: 'var(--basic-border-level6)',
          }}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs font-medium"
        >
          {isDark ? <SunIcon /> : <MoonIcon />}
          {isDark ? 'Light' : 'Dark'}
        </button>
      </header>

      {/* 본문 */}
      <main className="max-w-7xl mx-auto px-6 py-8 flex flex-col gap-10">
        {visible.map((g) => (
          <CategorySection key={g.category} {...g} />
        ))}
      </main>
    </div>
  )
}
