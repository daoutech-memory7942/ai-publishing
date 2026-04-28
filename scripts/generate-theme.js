import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const INPUT = path.resolve(__dirname, '../src/variables.css');
const OUTPUT = path.resolve(__dirname, '../src/theme.css');

const css = fs.readFileSync(INPUT, 'utf8');

// :root {} 블록만 추출 (첫 번째 :root 블록)
const rootMatch = css.match(/:root\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/);
if (!rootMatch) {
  console.error(':root block not found');
  process.exit(1);
}
const rootBlock = rootMatch[1];

// 직접값(raw)으로 포함할 접두사 → Tailwind @theme 네임스페이스 매핑
// --spacing-* : p, m, w, h, gap 등 spacing 유틸리티
// --radius-*  : rounded-* 유틸리티
// --color-*   : bg, text, border 등 색상 유틸리티
const RAW_PREFIX_NS = {
  '--tag-custom-': '--color-',
  '--doa-space-':  '--spacing-',
  '--doa-height-': '--spacing-',
  '--doa-radius-': '--radius-',
};

// var() 참조 변수 + 허용된 접두사의 직접값 파싱
const varLineRe = /^\s*(--[\w-]+)\s*:\s*(var\(--[\w-]+\))\s*;/;
const rawLineRe = /^\s*(--[\w-]+)\s*:\s*(.+?)\s*;/;

const entries = [];
for (const line of rootBlock.split('\n')) {
  const varMatch = line.match(varLineRe);
  if (varMatch) {
    entries.push({ name: varMatch[1], value: varMatch[2], raw: false });
    continue;
  }
  const rawMatch = line.match(rawLineRe);
  if (rawMatch) {
    const matchedPrefix = Object.keys(RAW_PREFIX_NS).find(p => rawMatch[1].startsWith(p));
    if (matchedPrefix) {
      entries.push({ name: rawMatch[1], value: rawMatch[2], raw: true });
    }
  }
}

// 변수명에 따른 Tailwind @theme 네임스페이스 결정
function getNamespace(name) {
  for (const [prefix, ns] of Object.entries(RAW_PREFIX_NS)) {
    if (name.startsWith(prefix)) return ns;
  }
  return '--color-';
}

// spacing/radius 네임스페이스는 Tailwind 클래스명이 소문자여야 하므로 키를 소문자로 변환
function getThemeKey(name, ns) {
  const key = name.replace(/^--/, '');
  return ns === '--color-' ? key : key.toLowerCase();
}

// 첫 번째 세그먼트 추출 (-- 제거 후 첫 번째 - 기준)
function getCategory(name) {
  // name: --button-bg-negative → button
  return name.replace(/^--/, '').split('-')[0];
}

// 카테고리별로 그룹핑
const groups = new Map();
for (const entry of entries) {
  const cat = getCategory(entry.name);
  if (!groups.has(cat)) groups.set(cat, []);
  groups.get(cat).push(entry);
}

// 출력 생성
const lines = ['@theme {'];
for (const [cat, vars] of groups) {
  lines.push(`  /* ${cat} */`);
  for (const { name, value, raw } of vars) {
    const ns = getNamespace(name);
    const themeVar = `${ns}${getThemeKey(name, ns)}`;
    const themeValue = raw ? value : `var(${name})`;
    lines.push(`  ${themeVar}: ${themeValue};`);
  }
  lines.push('');
}
// 마지막 빈 줄 제거
if (lines[lines.length - 1] === '') lines.pop();
lines.push('}');

fs.writeFileSync(OUTPUT, lines.join('\n') + '\n');
console.log(`Generated: ${OUTPUT} (${entries.length} variables, ${groups.size} categories)`);
