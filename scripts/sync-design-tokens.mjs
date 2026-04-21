#!/usr/bin/env node
/**
 * Parses design/variables.css and injects an @theme block into src/index.css.
 *
 * What gets included in @theme:
 *   - Primitive palette tokens  → --color-*
 *   - Semantic design tokens    → --color-*  (basic-*, primary-*, status-*, badge-text-*)
 *   - Typography                → --font-size-*, --leading-*, --tracking-*
 *   - Spacing                   → --spacing-*
 *   - Component heights         → --height-*
 *   - Border radius             → --radius-*
 *
 * What is excluded:
 *   - Component-level aliases (button-*, field-*, controls-*, layer-*, menu-*,
 *     messenger-*, tag-attendance-*, tag-system-*, toggle-*, badge-bg-*)
 *   - Tag custom colors (tag-custom-*)
 *   - String content variables (Sample-typo, Placeholder, ValueText)
 *   - Font-weight string literals ("SemiBold", "Medium", etc.)
 *
 * var() references are resolved to their primitive values so Tailwind's
 * opacity modifier system works (e.g. bg-primary/50).
 *
 * Usage:
 *   node scripts/sync-design-tokens.mjs          # run once
 *   node scripts/sync-design-tokens.mjs --watch  # watch mode
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const VARIABLES_CSS = path.join(ROOT, 'design/variables.css');
const INDEX_CSS = path.join(ROOT, 'src/index.css');

const MARKER_START = '/* @theme:start — auto-generated, do not edit */';
const MARKER_END   = '/* @theme:end */';
const DARK_START   = '/* @dark:start — auto-generated, do not edit */';
const DARK_END     = '/* @dark:end */';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract all --name: value; pairs from a CSS block string. */
function parseVars(block) {
  const map = new Map();
  const re = /--([^:]+):\s*([^;]+);/g;
  let m;
  while ((m = re.exec(block)) !== null) {
    map.set(m[1].trim(), m[2].trim());
  }
  return map;
}

/** Extract the inner content of the first selector block matching `selector`. */
function extractBlock(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Find the opening brace after the selector
  const selectorRe = new RegExp(escaped + '\\s*(?:,\\s*' + escaped + '\\s*\\*\\s*)?\\{');
  const match = selectorRe.exec(css);
  if (!match) return '';
  let depth = 0;
  let start = -1;
  let end = -1;
  for (let i = match.index; i < css.length; i++) {
    if (css[i] === '{') { if (depth === 0) start = i + 1; depth++; }
    else if (css[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  return start !== -1 && end !== -1 ? css.slice(start, end) : '';
}

/** Extract ALL rule blocks whose selector starts with `selector`.
 *  Avoids double-counting the `selector * {}` line inside the same rule. */
function extractAllBlocks(css, selector) {
  const results = [];
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Match only when selector is at the start of a rule (after } or whitespace at BOF)
  // and NOT when it is followed by " *" (the companion selector line)
  const selectorRe = new RegExp(
    '(?:^|\\})\\s*' + escaped + '(?!\\s*\\*)\\s*(?:,|\\{)',
    'g',
  );
  let sMatch;
  while ((sMatch = selectorRe.exec(css)) !== null) {
    // Advance past the } that was part of the look-behind group so we start from the selector
    const selStart = css.indexOf(selector, sMatch.index);
    let braceIdx = css.indexOf('{', selStart);
    if (braceIdx === -1) continue;
    let depth = 0, start = -1, end = -1;
    for (let i = braceIdx; i < css.length; i++) {
      if (css[i] === '{') { if (depth === 0) start = i + 1; depth++; }
      else if (css[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (start !== -1 && end !== -1) results.push(css.slice(start, end));
  }
  return results;
}

/**
 * Recursively resolve a value like "var(--Foo-52)" using the provided lookup.
 * Returns the resolved primitive value string (e.g. "rgb(8, 167, 191)").
 * If resolution fails (circular / missing), returns the original string.
 */
function resolveValue(value, lookup, depth = 0) {
  if (depth > 10) return value;
  const varRe = /var\(--([^)]+)\)/g;
  if (!varRe.test(value)) return value;
  varRe.lastIndex = 0;
  return value.replace(/var\(--([^)]+)\)/g, (_, name) => {
    const raw = lookup.get(name.trim());
    if (!raw) return `var(--${name})`; // keep unresolved
    return resolveValue(raw, lookup, depth + 1);
  });
}

// ---------------------------------------------------------------------------
// Name normalisation: CSS var name → Tailwind token name (no leading --)
// ---------------------------------------------------------------------------

function normalise(name) {
  return name
    .replace(/([a-z])([A-Z])/g, '$1-$2') // camelCase → kebab
    .toLowerCase();
}

/** Map a raw CSS variable name to its Tailwind @theme key (without --). */
function toThemeKey(name, category) {
  const n = normalise(name);
  switch (category) {
    case 'color':   return `color-${n}`;
    case 'spacing': return n; // keep original name, e.g. doa-space-4xl
    case 'height':  return n; // keep original name, e.g. doa-height-s
    case 'radius':  return n; // keep original name, e.g. doa-radius-m
    default:        return n;
  }
}

// ---------------------------------------------------------------------------
// Filtering: decide which raw variable names belong in @theme
// ---------------------------------------------------------------------------

const EXCLUDED_PREFIXES = [
  'Sample-', 'Placeholder', 'ValueText',
];

const FONT_WEIGHT_MAP = {
  '"Regular"':  '400',
  '"Medium"':   '500',
  '"SemiBold"': '600',
};

function isExcluded(name) {
  return EXCLUDED_PREFIXES.some(p => name.startsWith(p));
}

function isTypography(name) {
  return name.startsWith('font-size-')
      || name.startsWith('font-weight-')
      || name.startsWith('line-height-')
      || name.startsWith('letter-spacing-');
}

function categorise(name) {
  const n = normalise(name);
  // Match both --Space-4XL (:root fallback) and --doa-space-4XL (typed block)
  if (n.startsWith('space-') || n.startsWith('doa-space-'))   return 'spacing';
  if (n.startsWith('height-') || n.startsWith('doa-height-')) return 'height';
  if (n.startsWith('radius-') || n.startsWith('doa-radius-')) return 'radius';
  return 'color';
}

// ---------------------------------------------------------------------------
// Core parser
// ---------------------------------------------------------------------------

function buildTheme(css) {
  // 1. Build primitive lookup from :root block
  const rootBlock = extractBlock(css, ':root');
  const primitiveMap = parseVars(rootBlock);

  // 2. Override with typed palette blocks (more authoritative)
  const paletteBlock = extractBlock(css, '[data-Palette="Default"]');
  parseVars(paletteBlock).forEach((v, k) => primitiveMap.set(k, v));

  const primaryBlock = extractBlock(css, '[data-PalettePrimary="default"]');
  parseVars(primaryBlock).forEach((v, k) => primitiveMap.set(k, v));

  // 3. Typography / size / radius blocks — raw values, no var() refs
  const typoBlock    = extractBlock(css, '[data--Typography="Mode-1"]');
  const sizeBlock    = extractBlock(css, '[data--Size="Mode-1"]');
  const radiusBlock  = extractBlock(css, '[data--Radius="Mode-1"]');

  // 4. Semantic alias blocks — there are TWO [data--Color="Light"] blocks.
  //    First one = tag-custom colors, second one = semantic aliases.
  const lightBlocks = extractAllBlocks(css, '[data--Color="Light"]');
  const darkBlocks  = extractAllBlocks(css, '[data--Color="Dark"]');
  const lightSemanticRaw = lightBlocks[1] ?? '';
  const darkSemanticRaw  = darkBlocks[1]  ?? '';

  const lightSemanticMap = parseVars(lightSemanticRaw);
  const darkSemanticMap  = parseVars(darkSemanticRaw);

  // 5. Full lookup for resolving var() = primitives + light semantic tokens
  const lightLookup = new Map([...primitiveMap, ...lightSemanticMap]);
  const darkLookup  = new Map([...primitiveMap, ...darkSemanticMap]);

  // 6. Collect all @theme entries (light mode = default)
  // Use a Map to deduplicate — later calls overwrite earlier ones.
  const themeMap = new Map();

  function addEntries(varMap, lookup) {
    for (const [name, raw] of varMap) {
      if (isExcluded(name)) continue;
      if (isTypography(name)) continue; // handled by sync-typography
      const resolved = resolveValue(raw, lookup);
      if (resolved.startsWith('var(') || resolved.startsWith('"')) continue;
      const cat = categorise(name);
      const key = toThemeKey(name, cat);
      themeMap.set(key, resolved);
    }
  }

  addEntries(primitiveMap, primitiveMap);
  addEntries(parseVars(sizeBlock),   primitiveMap);
  addEntries(parseVars(radiusBlock), primitiveMap);
  addEntries(lightSemanticMap,       lightLookup);

  const themeEntries = [...themeMap.entries()];

  // 7. Collect dark-mode overrides (only semantic tokens that differ)
  const darkMap = new Map();
  for (const [name, raw] of darkSemanticMap) {
    if (isExcluded(name)) continue;
    const lightRaw  = lightSemanticMap.get(name);
    const resolved  = resolveValue(raw, darkLookup);
    const lightRes  = lightRaw ? resolveValue(lightRaw, lightLookup) : null;
    if (resolved.startsWith('var(') || resolved.startsWith('"')) continue;
    if (resolved === lightRes) continue; // unchanged in dark mode
    const cat = categorise(name);
    const key = toThemeKey(name, cat);
    darkMap.set(key, resolved);
  }
  const darkEntries = [...darkMap.entries()];

  return { themeEntries, darkEntries };
}

// ---------------------------------------------------------------------------
// CSS generation
// ---------------------------------------------------------------------------

function indent(entries, prefix = '  ') {
  return entries.map(([k, v]) => `${prefix}--${k}: ${v};`).join('\n');
}

function generateThemeBlock(themeEntries) {
  // Group by category — use a seen Set so each key appears in exactly one group
  const seen = new Set();
  function pick(predicate) {
    return themeEntries.filter(([k]) => { if (predicate(k) && !seen.has(k)) { seen.add(k); return true; } return false; });
  }

  const groups = [
    ['Semantic Tokens',   pick(k => /^color-(basic|primary-bg|primary-text|primary-icon|primary-border|status|badge-text)/.test(k))],
    ['Component Tokens',  pick(k => /^color-(badge|button|controls|field|layer|menu|messenger|tag|toggle)/.test(k))],
    ['Primitive Palette', pick(k => k.startsWith('color-'))],
    ['Spacing',           pick(k => k.startsWith('doa-space-') || k.startsWith('space-'))],
    ['Height',            pick(k => k.startsWith('doa-height-') || k.startsWith('height-'))],
    ['Radius',            pick(k => k.startsWith('doa-radius-') || k.startsWith('radius-'))],
  ];

  const parts = [];
  for (const [label, entries] of groups) {
    if (entries.length === 0) continue;
    parts.push(`  /* ${label} */\n${indent(entries)}`);
  }

  return `@theme {\n${parts.join('\n\n')}\n}`;
}

function generateDarkBlock(darkEntries) {
  if (darkEntries.length === 0) return '';
  return `[data-theme="dark"] {\n${indent(darkEntries)}\n}`;
}

// ---------------------------------------------------------------------------
// index.css injection
// ---------------------------------------------------------------------------

const CUSTOM_VARIANT = '@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));';

function injectIntoIndexCSS(themeCss, darkCss) {
  let src = fs.readFileSync(INDEX_CSS, 'utf8');

  // Ensure @custom-variant dark line exists right after @import
  if (!src.includes('@custom-variant dark')) {
    src = src.replace(
      '@import "tailwindcss";',
      `@import "tailwindcss";\n\n${CUSTOM_VARIANT}`,
    );
  }

  // Inject @theme block
  if (src.includes(MARKER_START)) {
    const re = new RegExp(
      escapeRegex(MARKER_START) + '[\\s\\S]*?' + escapeRegex(MARKER_END),
    );
    src = src.replace(re, `${MARKER_START}\n${themeCss}\n${MARKER_END}`);
  } else {
    // Insert after @custom-variant line
    const cvIdx = src.indexOf(CUSTOM_VARIANT);
    const insertIdx = src.indexOf('\n', cvIdx) + 1;
    src = src.slice(0, insertIdx) + `\n${MARKER_START}\n${themeCss}\n${MARKER_END}\n` + src.slice(insertIdx);
  }

  // Inject dark overrides block
  if (darkCss) {
    if (src.includes(DARK_START)) {
      const re = new RegExp(escapeRegex(DARK_START) + '[\\s\\S]*?' + escapeRegex(DARK_END));
      src = src.replace(re, `${DARK_START}\n${darkCss}\n${DARK_END}`);
    } else {
      src += `\n${DARK_START}\n${darkCss}\n${DARK_END}\n`;
    }
  }

  fs.writeFileSync(INDEX_CSS, src);
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function run() {
  const css = fs.readFileSync(VARIABLES_CSS, 'utf8');
  const { themeEntries, darkEntries } = buildTheme(css);
  const themeCss = generateThemeBlock(themeEntries);
  const darkCss  = generateDarkBlock(darkEntries);
  injectIntoIndexCSS(themeCss, darkCss);
  console.log(`[sync-design-tokens] Updated src/index.css — ${themeEntries.length} tokens, ${darkEntries.length} dark overrides`);
}

run();

// Watch mode
if (process.argv.includes('--watch')) {
  console.log('[sync-design-tokens] Watching design/variables.css…');
  let debounce;
  fs.watch(VARIABLES_CSS, () => {
    clearTimeout(debounce);
    debounce = setTimeout(run, 200);
  });
}
