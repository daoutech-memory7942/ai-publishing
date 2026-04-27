import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const VARIABLES_CSS = path.resolve(__dirname, '../src/variables.css');
const OUTPUT_CSS = path.resolve(__dirname, '../src/typo.css');

const WEIGHT_MAP = {
  Light: 300,
  Regular: 400,
  Medium: 500,
  SemiBold: 600,
  Bold: 700,
  ExtraBold: 800,
};

const TYPO_CATEGORIES = new Set(['Heading', 'Body', 'Label', 'Caption', 'Display', 'Title']);
const CATEGORY_ORDER = ['Heading', 'Body', 'Label', 'Caption', 'Display', 'Title'];

// ── env ────────────────────────────────────────────────────────────────────

function readEnv() {
  const raw = fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf8');
  return Object.fromEntries(
    raw.split('\n')
      .map(l => l.match(/^\s*([\w]+)\s*=\s*"?([^"\n]*)"?\s*$/))
      .filter(Boolean)
      .map(([, k, v]) => [k, v])
  );
}

// ── http ───────────────────────────────────────────────────────────────────

function httpGet(url, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      { hostname: u.hostname, path: u.pathname + u.search, headers: { 'X-Figma-Token': token } },
      res => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
          catch (e) { reject(new Error('JSON parse failed: ' + e.message)); }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

// ── variables.css ──────────────────────────────────────────────────────────

function parseVariablesCSS() {
  const css = fs.readFileSync(VARIABLES_CSS, 'utf8');
  // 첫 번째 :root 블록만 파싱
  const rootMatch = css.match(/:root\s*\{([\s\S]*?)\}/);
  if (!rootMatch) throw new Error(':root block not found in variables.css');

  const cssVars = {};
  for (const line of rootMatch[1].split('\n')) {
    const m = line.match(/^\s*(--[\w-]+)\s*:\s*(.+?)\s*;/);
    if (m) cssVars[m[1]] = m[2].replace(/^"|"$/g, '').trim();
  }

  // 숫자값 기준 lookup map: value → varName[] (같은 값이 여러 변수에 존재할 수 있음)
  const maps = { fontSize: {}, lineHeight: {}, letterSpacing: {}, fontWeight: {} };
  for (const [name, raw] of Object.entries(cssVars)) {
    const num = parseFloat(raw);
    if (!isNaN(num)) {
      if (name.startsWith('--font-size-')) {
        (maps.fontSize[num] ??= []).push(name);
      } else if (name.startsWith('--line-height-')) {
        (maps.lineHeight[num] ??= []).push(name);
      } else if (name.startsWith('--letter-spacing-')) {
        (maps.letterSpacing[num] ??= []).push(name);
      }
    }
    if (name.startsWith('--font-weight-')) {
      const w = WEIGHT_MAP[raw];
      if (w) (maps.fontWeight[w] ??= []).push(name);
    }
  }
  return maps;
}

// ── lookup ──────────────────────────────────────────────────────────────────

// 스타일명 기반 우선순위 점수: 변수명 세그먼트와 스타일명 세그먼트 일치 개수
// font-size/line-height/letter-spacing 변수는 weight 정보 없음 → 마지막 세그먼트(B/M/R) 제외
function matchScore(varName, styleName) {
  const varParts   = varName.replace(/^--/, '').toLowerCase().split('-');
  const allParts   = styleName.replace(/[/]/g, '-').toLowerCase().split('-');
  const styleParts = allParts.slice(0, -1); // 마지막 weight 세그먼트 제외
  return styleParts.reduce((s, p) => s + (varParts.includes(p) ? 1 : 0), 0);
}

// 오차 범위 내 후보 중 스타일명과 가장 잘 맞는 변수 반환, 없으면 null
function lookup(map, value, styleName, tol = 0.02) {
  const candidates = [];
  for (const [k, names] of Object.entries(map)) {
    if (Math.abs(parseFloat(k) - value) <= tol) candidates.push(...names);
  }
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return `var(${candidates[0]})`;

  // 동일 값 충돌 시 스타일명과 가장 유사한 변수명 선택
  const best = candidates.reduce((a, b) =>
    matchScore(b, styleName) > matchScore(a, styleName) ? b : a
  );
  return `var(${best})`;
}

// ── naming ──────────────────────────────────────────────────────────────────

function tokenToClass(name) {
  return 'typo-' + name.replace(/\//g, '-').toLowerCase();
}

// ── letter-spacing 정규화 ───────────────────────────────────────────────────

// Figma REST API: letterSpacing는 숫자(px) 또는 {value, unit} 객체
function resolveLetterSpacing(raw, fontSize) {
  if (typeof raw === 'object' && raw !== null) {
    return raw.unit === 'PERCENT' ? (raw.value / 100) * fontSize : raw.value;
  }
  return typeof raw === 'number' ? raw : 0;
}

// ── main ───────────────────────────────────────────────────────────────────

async function main() {
  const env = readEnv();
  const PAT = env.VITE_FIGMA_PAT;
  const FILE_KEY = env.VITE_FIGMA_FILE_KEY;
  if (!PAT || !FILE_KEY) throw new Error('VITE_FIGMA_PAT or VITE_FIGMA_FILE_KEY not found in .env');

  // 1. 파일의 모든 텍스트 스타일 목록
  process.stdout.write('Fetching text styles... ');
  const stylesRes = await httpGet(`https://api.figma.com/v1/files/${FILE_KEY}/styles`, PAT);
  if (stylesRes.error) throw new Error(`Figma API: ${stylesRes.message}`);
  const textStyles = (stylesRes.meta?.styles ?? []).filter(s => s.style_type === 'TEXT');
  console.log(`${textStyles.length} styles found`);

  // 2. 노드 상세 정보 배치 요청 (100개씩)
  const nodeIds = textStyles.map(s => s.node_id);
  const styleNodeMap = {};
  const BATCH = 100;
  for (let i = 0; i < nodeIds.length; i += BATCH) {
    const slice = nodeIds.slice(i, i + BATCH);
    process.stdout.write(`Fetching nodes ${i + 1}–${i + slice.length}... `);
    const res = await httpGet(
      `https://api.figma.com/v1/files/${FILE_KEY}/nodes?ids=${slice.join(',')}`,
      PAT
    );
    if (res.error) throw new Error(`Figma nodes API: ${res.message}`);
    for (const [id, data] of Object.entries(res.nodes ?? {})) {
      styleNodeMap[id] = data.document;
    }
    console.log('done');
  }

  // 3. variables.css 파싱 → lookup map
  const maps = parseVariablesCSS();

  // 4. typo entry 생성
  const entries = [];
  for (const style of textStyles) {
    const category = style.name.split('/')[0];
    if (!TYPO_CATEGORIES.has(category)) continue;

    const doc = styleNodeMap[style.node_id];
    if (!doc?.style) {
      console.warn(`  [warn] style node not found: ${style.name} (${style.node_id})`);
      continue;
    }

    const s = doc.style;
    const fsVal = s.fontSize ?? 0;
    const lhVal = s.lineHeightPx ?? 0;
    const lsVal = resolveLetterSpacing(s.letterSpacing, fsVal);
    const wVal  = s.fontWeight ?? 400;

    entries.push({
      tokenName:     style.name,
      category,
      className:     tokenToClass(style.name),
      fontSize:      lookup(maps.fontSize,      fsVal, style.name) ?? `${fsVal}px`,
      lineHeight:    lookup(maps.lineHeight,     lhVal, style.name) ?? `${Math.round(lhVal * 100) / 100}px`,
      letterSpacing: lookup(maps.letterSpacing,  lsVal, style.name) ?? `${Math.round(lsVal * 100) / 100}px`,
      fontWeight:    wVal,
    });
  }

  // 중복 클래스명 제거 (같은 tokenName이 Figma에 중복 등록된 경우)
  const seen = new Set();
  const deduped = entries.filter(e => {
    if (seen.has(e.className)) {
      console.warn(`  [warn] duplicate class skipped: .${e.className} (${e.tokenName})`);
      return false;
    }
    seen.add(e.className);
    return true;
  });
  const finalEntries = deduped;

  console.log(`\n${finalEntries.length} typo classes to generate`);
  if (finalEntries.length === 0) {
    console.warn('No entries. Check TYPO_CATEGORIES or style names in Figma.');
    process.exit(1);
  }

  // 5. 카테고리 순서 → 토큰명 순으로 정렬
  finalEntries.sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a.category);
    const bi = CATEGORY_ORDER.indexOf(b.category);
    const diff = (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    return diff !== 0 ? diff : a.tokenName.localeCompare(b.tokenName);
  });

  // 6. 카테고리별 그룹
  const grouped = new Map();
  for (const e of finalEntries) {
    if (!grouped.has(e.category)) grouped.set(e.category, []);
    grouped.get(e.category).push(e);
  }

  // 7. CSS 출력
  const lines = ['@layer components {'];
  let firstGroup = true;
  for (const [cat, catEntries] of grouped) {
    if (!firstGroup) lines.push('');
    firstGroup = false;
    lines.push(`  /* ${cat} */`);
    for (const e of catEntries) {
      lines.push(`  .${e.className} {`);
      lines.push(`    font-size: ${e.fontSize};`);
      lines.push(`    line-height: ${e.lineHeight};`);
      lines.push(`    letter-spacing: ${e.letterSpacing};`);
      lines.push(`    font-weight: ${e.fontWeight};`);
      lines.push(`  }`);
    }
  }
  lines.push('}');

  fs.writeFileSync(OUTPUT_CSS, lines.join('\n') + '\n');
  console.log(`Generated: ${OUTPUT_CSS} (${finalEntries.length} classes)`);
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
