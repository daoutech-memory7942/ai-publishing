#!/usr/bin/env node
/**
 * Reads design/typography.css and injects an @layer components block into src/index.css.
 *
 * Token resolution: parses design/variables.css [data--Typography="Mode-1"] directly,
 * so this script has no dependency on sync-design-tokens having run first.
 * All var(--*) references are replaced with concrete values before injection.
 *
 *   /* @typo:start — auto-generated, do not edit *\/
 *   @layer components { ... }
 *   /* @typo:end *\/
 *
 * Usage:
 *   node scripts/sync-typography.mjs          # run once
 *   node scripts/sync-typography.mjs --watch  # watch mode
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname    = path.dirname(fileURLToPath(import.meta.url));
const ROOT         = path.resolve(__dirname, '..');
const VARIABLES_CSS = path.join(ROOT, 'design/variables.css');
const TYPO_CSS     = path.join(ROOT, 'design/typography.css');
const INDEX_CSS    = path.join(ROOT, 'src/index.css');

const MARKER_START = '/* @typo:start — auto-generated, do not edit */';
const MARKER_END   = '/* @typo:end */';

const FONT_WEIGHT_MAP = {
  '"Regular"':  '400',
  '"Medium"':   '500',
  '"SemiBold"': '600',
};

// ---------------------------------------------------------------------------
// variables.css parsing
// ---------------------------------------------------------------------------

/** Extract --name: value; pairs from a CSS block string. */
function parseVars(block) {
  const map = new Map();
  const re = /--([^:]+):\s*([^;]+);/g;
  let m;
  while ((m = re.exec(block)) !== null) map.set(m[1].trim(), m[2].trim());
  return map;
}

/** Extract the inner content of the first block matching `selector`. */
function extractBlock(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const selectorRe = new RegExp(escaped + '\\s*(?:,\\s*' + escaped + '\\s*\\*\\s*)?\\{');
  const match = selectorRe.exec(css);
  if (!match) return '';
  let depth = 0, start = -1, end = -1;
  for (let i = match.index; i < css.length; i++) {
    if (css[i] === '{') { if (depth === 0) start = i + 1; depth++; }
    else if (css[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  return start !== -1 && end !== -1 ? css.slice(start, end) : '';
}

/** Normalise a Figma variable name to a Tailwind-compatible token key.
 *  e.g. "font-size-Heading-3XL" → "font-size-heading-3xl" */
function normalise(name) {
  return name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * Build a Map<themeKey, value> from the [data--Typography="Mode-1"] block.
 * Keys match the CSS variable names that typography.css uses via var(--*).
 *
 *   font-size-Heading-3XL   → font-size-heading-3xl    : 40px
 *   font-weight-B           → font-weight-b             : 600
 *   line-height-Heading-3XL → leading-heading-3xl       : 48px
 *   letter-spacing-Heading-3XL → tracking-heading-3xl  : -0.8px
 */
function buildTypoTokenMap(variablesCss) {
  const block = extractBlock(variablesCss, '[data--Typography="Mode-1"]');
  const vars  = parseVars(block);
  const map   = new Map();

  for (const [name, raw] of vars) {
    const n = normalise(name);
    let key, value;

    if (n.startsWith('font-size-')) {
      key   = n;
      value = raw;
    } else if (n.startsWith('font-weight-')) {
      key   = n;
      value = FONT_WEIGHT_MAP[raw];
      if (!value) continue; // skip unconvertible strings
    } else if (n.startsWith('line-height-')) {
      key   = `leading-${n.replace(/^line-height-/, '')}`;
      value = raw;
    } else if (n.startsWith('letter-spacing-')) {
      key   = `tracking-${n.replace(/^letter-spacing-/, '')}`;
      value = raw;
    } else {
      continue; // skip Sample-typo, Placeholder, etc.
    }

    map.set(key, value);
  }

  return map;
}

// ---------------------------------------------------------------------------
// CSS processing
// ---------------------------------------------------------------------------

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Replace every var(--name) with its resolved value from tokenMap. */
function resolveVars(css, tokenMap) {
  return css.replace(/var\(--([^)]+)\)/g, (original, name) => {
    return tokenMap.get(name.trim()) ?? original;
  });
}

/** Remove the file-level block comment at the top of typography.css. */
function stripFileComment(css) {
  return css.replace(/^\/\*[\s\S]*?\*\/\s*/, '');
}

/** Remove inline value hints like  /* 40px *\/  that become stale after resolution. */
function stripInlineHints(css) {
  return css.replace(/\s*\/\*[^*]*\*\//g, '');
}

/** Indent every non-empty line by two spaces. */
function indentBlock(css) {
  return css
    .split('\n')
    .map(line => (line.trim() === '' ? '' : `  ${line}`))
    .join('\n');
}

function buildLayerBlock(typoCss, tokenMap) {
  let css = stripFileComment(typoCss);
  css = resolveVars(css, tokenMap);
  css = stripInlineHints(css);
  css = indentBlock(css.trimEnd());
  return `@layer components {\n${css}\n}`;
}

// ---------------------------------------------------------------------------

function run() {
  const variablesCss = fs.readFileSync(VARIABLES_CSS, 'utf8');
  const tokenMap     = buildTypoTokenMap(variablesCss);

  const typoCss  = fs.readFileSync(TYPO_CSS, 'utf8');
  const layerCss = buildLayerBlock(typoCss, tokenMap);

  let src = fs.readFileSync(INDEX_CSS, 'utf8');
  if (src.includes(MARKER_START)) {
    const re = new RegExp(
      escapeRegex(MARKER_START) + '[\\s\\S]*?' + escapeRegex(MARKER_END),
    );
    src = src.replace(re, `${MARKER_START}\n${layerCss}\n${MARKER_END}`);
  } else {
    src += `\n${MARKER_START}\n${layerCss}\n${MARKER_END}\n`;
  }

  fs.writeFileSync(INDEX_CSS, src);

  const classCount = (typoCss.match(/^\.[a-z]/gm) ?? []).length;
  console.log(`[sync-typography] Updated src/index.css — ${classCount} classes, ${tokenMap.size} typography tokens`);
}

run();

// ---------------------------------------------------------------------------
// Watch mode

if (process.argv.includes('--watch')) {
  console.log('[sync-typography] Watching design/typography.css…');
  let debounce;
  fs.watch(TYPO_CSS, () => {
    clearTimeout(debounce);
    debounce = setTimeout(run, 200);
  });
}
