import { SIMPLIFIED, TRADITIONAL } from './simplified';

const HAN = /[\u3400-\u9fff\uf900-\ufaff]/;
const LATIN = /[A-Za-z]/;
const SEPARATORS = /\s*[·｜|]\s*|\s+\/\s+/;
const ZH_SUFFIX_WORDS = new Set(['詳解', '設定', '說明', '教學', '指南', '分頁', '頁面', '欄位', '按鈕', '功能', '頁', '欄', '表']);
const EDGE_JUNK = /^[\s·|｜/:：,，;；\-–—]+|[\s·|｜/:：,，;；\-–—]+$/g;

export type TextParts =
  | { kind: 'none' }
  | { kind: 'en'; en: string }
  | { kind: 'zh'; zh: string }
  | { kind: 'mixed'; en: string; zh: string };

function stripUnbalanced(text: string) {
  let out = text.replace(EDGE_JUNK, '');
  const pairs: [string, string][] = [['(', ')'], ['（', '）'], ['[', ']'], ['「', '」']];
  for (const [open, close] of pairs) {
    if (out.startsWith(open) && out.endsWith(close) && out.split(open).length === 2) out = out.slice(1, -1);
    if (out.endsWith(open)) out = out.slice(0, -1);
    if (out.startsWith(close)) out = out.slice(1);
    if (out.split(open).length < out.split(close).length && out.endsWith(close)) out = out.slice(0, -1);
    if (out.split(open).length > out.split(close).length && out.startsWith(open)) out = out.slice(1);
  }
  return out.replace(EDGE_JUNK, '');
}

function pair(en: string, zh: string): TextParts | null {
  const e = stripUnbalanced(en);
  const z = stripUnbalanced(zh);
  if (ZH_SUFFIX_WORDS.has(z)) return null;
  return e && z && LATIN.test(e) && HAN.test(z) ? { kind: 'mixed', en: e, zh: z } : null;
}

export function splitBilingual(core: string): TextParts {
  const hasHan = HAN.test(core);
  const hasLatin = LATIN.test(core);
  if (!hasHan) return hasLatin ? { kind: 'en', en: core } : { kind: 'none' };
  if (!hasLatin) return { kind: 'zh', zh: core };

  const parts = core.split(SEPARATORS).filter((p) => p.trim());
  if (parts.length >= 2) {
    const zhParts = parts.filter((p) => HAN.test(p));
    const enParts = parts.filter((p) => !HAN.test(p) && LATIN.test(p));
    if (zhParts.length && enParts.length && zhParts.every((p) => !LATIN.test(p) || HAN.test(p))) {
      const split = pair(enParts.join(' · '), zhParts.join(' · '));
      if (split) return split;
    }
  }

  const chars = [...core];
  const first = chars.findIndex((c) => HAN.test(c));
  let last = -1;
  chars.forEach((c, i) => { if (HAN.test(c)) last = i; });

  const before = chars.slice(0, first).join('');
  const fromFirst = chars.slice(first).join('');
  if (LATIN.test(before) && !LATIN.test(fromFirst)) {
    const split = pair(before, fromFirst);
    if (split) return split;
  }

  const upToLast = chars.slice(0, last + 1).join('');
  const after = chars.slice(last + 1).join('');
  if (LATIN.test(after) && !LATIN.test(upToLast)) {
    const split = pair(after, upToLast);
    if (split) return split;
  }

  return { kind: 'zh', zh: core };
}

const SIMPLIFIED_CHARS = [...SIMPLIFIED];
const SIMPLIFIED_MAP = new Map([...TRADITIONAL].map((c, i) => [c, SIMPLIFIED_CHARS[i]]));

export function toSimplified(text: string) {
  if (!HAN.test(text)) return text;
  return [...text].map((c) => SIMPLIFIED_MAP.get(c) ?? c).join('');
}

export function worthTranslating(text: string) {
  if (HAN.test(text)) return true;
  if (!/[A-Za-z]{2}/.test(text) || /@|:\/\//.test(text)) return false;
  const trimmed = text.trim();
  if (!/\s/.test(trimmed)) {
    if (/\d/.test(trimmed)) return false;
    if (/^[A-Z0-9._\-/]+$/.test(trimmed)) return false;
  }
  return true;
}
