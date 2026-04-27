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

// var() 참조 변수만 파싱
const varLineRe = /^\s*(--[\w-]+)\s*:\s*(var\(--[\w-]+\))\s*;/;

const entries = [];
for (const line of rootBlock.split('\n')) {
  const m = line.match(varLineRe);
  if (!m) continue;
  entries.push({ name: m[1], value: m[2] });
}

// 네임스페이스 결정 (항상 --color-)
function getNamespace() {
  return '--color-';
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
  for (const { name, value } of vars) {
    const ns = getNamespace();
    const themeVar = `${ns}${name.replace(/^--/, '')}`;
    lines.push(`  ${themeVar}: var(${name});`);
  }
  lines.push('');
}
// 마지막 빈 줄 제거
if (lines[lines.length - 1] === '') lines.pop();
lines.push('}');

fs.writeFileSync(OUTPUT, lines.join('\n') + '\n');
console.log(`Generated: ${OUTPUT} (${entries.length} variables, ${groups.size} categories)`);
