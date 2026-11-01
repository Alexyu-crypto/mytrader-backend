import { isChinese, type AppLang } from './languages';
import { splitBilingual, toSimplified, worthTranslating } from './bilingual';
import { ZH_DICTIONARY } from './zhDictionary';

type Shown = { orig: string; shown: string };

const ATTRS = ['placeholder', 'title', 'aria-label'];
const SKIP = 'script,style,noscript,code,pre,textarea,svg,[translate="no"],.notranslate,[contenteditable="true"]';
const HIDDEN_ATTR = 'data-i18n-hidden';
const PAIR_MAX = 300;
const PAIR_TAGS = new Set(['SPAN', 'P', 'DIV', 'SMALL', 'LABEL', 'B', 'STRONG', 'EM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
const FILLER = /^[\s·|｜/\-–—]*$/;
const ZH_LEAD_PUNCT = /^[：:，,。、；;）)→]/;
const NUMBER = /[-+]?\d+(?:[.,]\d+)*/g;
const TAIL = /\s*(?:\.\.\.|…|:|：)$/;

function builtInZh(source: string): string | undefined {
  const exact = ZH_DICTIONARY[source];
  if (exact !== undefined) return exact;
  const numbers = source.match(NUMBER);
  if (numbers) {
    const template = ZH_DICTIONARY[source.replace(NUMBER, '#')];
    if (template !== undefined) {
      let i = 0;
      return template.replace(/#/g, () => numbers[i++] ?? '#');
    }
  }
  const tail = source.match(TAIL);
  if (tail) {
    const head = builtInZh(source.slice(0, -tail[0].length));
    if (head !== undefined) return head + (tail[0].trim() === ':' ? '：' : tail[0].trim());
  }
  return undefined;
}

export function createPageTranslator(root: HTMLElement) {
  let lang: AppLang = 'en';
  const texts = new WeakMap<Text, Shown>();
  const attrs = new WeakMap<Element, Map<string, Shown>>();

  function render(original: string) {
    const core = original.trim();
    if (!core) return original;
    const parts = splitBilingual(core);
    if (parts.kind === 'none') return original;

    let out: string;
    if (lang === 'en') {
      out = parts.kind === 'zh' ? parts.zh : parts.en;
    } else {
      const zh = parts.kind === 'en' ? builtInZh(parts.en) ?? parts.en : parts.zh;
      out = lang === 'zh-Hans' ? toSimplified(zh) : zh;
    }
    const lead = original.slice(0, original.length - original.trimStart().length);
    const trail = original.slice(original.trimEnd().length);
    return lead + out + trail;
  }

  function origText(node: Node): string {
    if (node instanceof Text) {
      const rec = texts.get(node);
      return rec && node.data === rec.shown ? rec.orig : node.data;
    }
    if (!(node instanceof Element) || node.matches(SKIP)) return '';
    let out = '';
    for (const c of node.childNodes) {
      out += origText(c);
      if (out.length > PAIR_MAX) break;
    }
    return out;
  }

  /** The node, or the wrapper elements that hold only this text, so a side-by-side English/Chinese pair can be found. */
  function pairSelf(node: Text): Node {
    let self: Node = node;
    for (let i = 0; i < 3; i++) {
      const p = self.parentElement;
      if (!p || !PAIR_TAGS.has(p.tagName)) break;
      // Judge by the original text: a half we blanked out must still count, or hiding and showing it flip forever.
      const meaningful = [...p.childNodes].filter((c) => !(c instanceof Text && !origText(c).trim()));
      if (meaningful.length !== 1) break;
      self = p;
    }
    return self;
  }

  function isPairText(text: string, kind: 'en' | 'zh') {
    const core = text.trim();
    if (!core || core.length > PAIR_MAX) return false;
    const parts = splitBilingual(core);
    if (parts.kind !== kind) return false;
    return kind === 'zh' ? !ZH_LEAD_PUNCT.test(core) : /[a-z]/.test(core) && !/[：:]$/.test(core) && worthTranslating(core);
  }

  function hasPartner(self: Node, kind: 'en' | 'zh') {
    for (const step of ['previousSibling', 'nextSibling'] as const) {
      let sib = self[step];
      while (sib instanceof Text && FILLER.test(origText(sib))) sib = sib[step];
      if (!sib || (sib instanceof Element && !PAIR_TAGS.has(sib.tagName))) continue;
      if (isPairText(origText(sib), kind)) return true;
    }
    return false;
  }

  function hiddenAsPair(orig: string, self: Node) {
    const zhMode = isChinese(lang);
    const ownKind = zhMode ? 'en' : 'zh';
    return isPairText(orig, ownKind) && hasPartner(self, ownKind === 'en' ? 'zh' : 'en');
  }

  function applyText(node: Text) {
    const orig = origText(node);
    const self = pairSelf(node);
    const hide = hiddenAsPair(orig, self);
    if (self instanceof Element) self.toggleAttribute(HIDDEN_ATTR, hide);
    const shown = hide ? (self === node ? '' : orig) : render(orig);
    if (node.data !== shown) node.data = shown;
    texts.set(node, { orig, shown });
  }

  function applyAttr(el: Element, name: string) {
    const value = el.getAttribute(name);
    if (value === null) return;
    const map = attrs.get(el) ?? new Map<string, Shown>();
    const rec = map.get(name);
    const orig = rec && value === rec.shown ? rec.orig : value;
    const shown = render(orig);
    map.set(name, { orig, shown });
    attrs.set(el, map);
    if (value !== shown) el.setAttribute(name, shown);
  }

  function applyElementAttrs(el: Element) {
    for (const name of ATTRS) if (el.hasAttribute(name)) applyAttr(el, name);
  }

  function walk(start: Node) {
    const startEl = start instanceof Element ? start : start.parentElement;
    if (!startEl || startEl.closest(SKIP)) return;
    if (start instanceof Text) {
      applyText(start);
      return;
    }
    const walker = document.createTreeWalker(start, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n instanceof Element && n.matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    for (let n: Node | null = walker.currentNode; n; n = walker.nextNode()) {
      if (n instanceof Text) applyText(n);
      else if (n instanceof Element) applyElementAttrs(n);
    }
  }

  const observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'characterData' && r.target instanceof Text) walk(r.target);
      else if (r.type === 'attributes' && r.target instanceof Element && r.attributeName) {
        if (!r.target.closest(SKIP)) applyAttr(r.target, r.attributeName);
      } else r.addedNodes.forEach(walk);
    }
  });
  observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });

  return {
    setLang(next: AppLang) {
      lang = next;
      walk(root);
    },
    stop() {
      observer.disconnect();
    },
  };
}
