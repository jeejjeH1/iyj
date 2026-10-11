// 2D typography layer: DOM elements whose state is a pure function of time.
import { clamp, seg, ease } from './util.js';

const root = () => document.getElementById('ov');
const items = [];

export function el(tag, cls, html, style = {}, parent) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  Object.assign(e.style, style);
  (parent || root()).appendChild(e);
  return e;
}

// Split text into word wrappers containing char spans (keeps natural wrapping).
// Supports inline markup via [[accent]] and {{strong}} tokens.
function splitChars(target, text) {
  const chars = [];
  const parts = text.split(/(\[\[.*?\]\]|\{\{.*?\}\}|\n)/g).filter((s) => s !== '');
  for (const part of parts) {
    if (part === '\n') { target.appendChild(document.createElement('br')); continue; }
    let cls = null, str = part;
    if (part.startsWith('[[')) { cls = 'acc'; str = part.slice(2, -2); }
    if (part.startsWith('{{')) { cls = 'hi'; str = part.slice(2, -2); }
    const words = str.split(/( )/);
    for (const w of words) {
      if (w === ' ') { target.appendChild(document.createTextNode(' ')); continue; }
      if (!w) continue;
      const ws = document.createElement('span');
      ws.className = 'w' + (cls ? ' ' + cls : '');
      for (const ch of w) {
        const c = document.createElement('span');
        c.className = 'c';
        c.textContent = ch;
        ws.appendChild(c);
        chars.push(c);
      }
      target.appendChild(ws);
    }
  }
  return chars;
}

/**
 * Animated text block.
 * kind: 'rise' (chars rise + unblur), 'scramble' (decode from glyphs), 'type' (typewriter), 'fade', 'wipe'
 */
export function text(str, cls, style, a, parent) {
  const e = el('div', 'tx ' + (cls || ''), '', style, parent);
  const o = Object.assign({ in: 0, out: 1e9, kind: 'rise', stagger: 0.018, dur: 0.6, outDur: 0.35, dy: 0.55, blur: 10 }, a);
  const item = { e, o, str };
  if (o.kind === 'scramble' || o.kind === 'type') {
    item.chars = splitChars(e, str);
    item.final = item.chars.map((c) => c.textContent);
  } else if (o.kind === 'fade' || o.kind === 'wipe') {
    e.innerHTML = str.replace(/\[\[(.*?)\]\]/g, '<span class="acc">$1</span>').replace(/\{\{(.*?)\}\}/g, '<span class="hi">$1</span>').replace(/\n/g, '<br>');
  } else {
    item.chars = splitChars(e, str);
  }
  items.push(item);
  return item;
}

// arbitrary element with a fade/slide envelope
export function block(e, a) {
  const o = Object.assign({ in: 0, out: 1e9, kind: 'fade', dur: 0.6, outDur: 0.35, dx: 0, dy: 30, scale: 1 }, a);
  const item = { e, o, block: true };
  items.push(item);
  return item;
}

const GLYPHS = '01ABCDEF#$%&*+=/<>?▓▒░9x7a3';
const hash = (a, b) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

function update(item, t) {
  const { e, o } = item;
  if (t < o.in - 0.05 || t > o.out + 0.05) { e.style.display = 'none'; return; }
  e.style.display = '';
  const outP = ease.in(seg(t, o.out - o.outDur, o.out));
  if (item.block) {
    const p = ease.outQuart(seg(t, o.in, o.in + o.dur));
    const k = (1 - p);
    e.style.opacity = (p * (1 - outP)).toFixed(3);
    const s = o.scale + (1 - o.scale) * p;
    e.style.transform = `translate(${o.dx * k}px, ${o.dy * k - outP * 14}px) scale(${s})`;
    if (o.kind === 'wipe') e.style.clipPath = `inset(0 ${(1 - p) * 100}% 0 0)`;
    if (o.blur) e.style.filter = `blur(${(k * o.blur + outP * 6).toFixed(2)}px)`;
    return;
  }
  if (o.kind === 'fade' || o.kind === 'wipe') {
    const p = ease.outQuart(seg(t, o.in, o.in + o.dur));
    e.style.opacity = (p * (1 - outP)).toFixed(3);
    if (o.kind === 'wipe') e.style.clipPath = `inset(-10% ${(1 - p) * 100}% -10% 0)`;
    else e.style.transform = `translateY(${(1 - p) * 18 - outP * 10}px)`;
    return;
  }
  const n = item.chars.length;
  if (o.kind === 'rise') {
    for (let i = 0; i < n; i++) {
      const c = item.chars[i];
      const p = ease.outQuart(seg(t, o.in + i * o.stagger, o.in + i * o.stagger + o.dur));
      const q = ease.in(seg(t, o.out - o.outDur + (i / n) * 0.12, o.out));
      const a = p * (1 - q);
      c.style.opacity = a.toFixed(3);
      c.style.transform = `translateY(${((1 - p) * o.dy - q * 0.25).toFixed(3)}em)`;
      const b = (1 - p) * o.blur + q * 8;
      c.style.filter = b > 0.05 ? `blur(${b.toFixed(2)}px)` : '';
    }
  } else if (o.kind === 'scramble' || o.kind === 'type') {
    const frame = Math.floor(t * 30);
    for (let i = 0; i < n; i++) {
      const c = item.chars[i];
      const start = o.in + i * o.stagger;
      const settle = start + (o.kind === 'type' ? 0.0 : o.dur);
      if (t < start) { c.style.opacity = '0'; continue; }
      c.style.opacity = (1 - outP).toFixed(3);
      if (t < settle && item.final[i] !== ' ') {
        c.textContent = GLYPHS[Math.floor(hash(frame, i) * GLYPHS.length)];
        c.classList.add('scr');
      } else {
        c.textContent = item.final[i];
        c.classList.remove('scr');
      }
    }
  }
}

export function updateOverlay(t) {
  for (const it of items) update(it, t);
}

// scrambling text whose final string can change over time (e.g. encrypt / decrypt)
export function morphText(e, from, to, t, t0, dur, frameSalt = 0) {
  const p = clamp((t - t0) / dur) * 1.3 - 0.15;
  const L = Math.max(from.length, to.length);
  const frame = Math.floor(t * 30);
  let s = '';
  for (let i = 0; i < L; i++) {
    const ci = i / L;
    const a = from[i] ?? ' ', b = to[i] ?? ' ';
    if (p <= ci - 0.15) s += a;
    else if (p >= ci + 0.15) s += b;
    else s += b === ' ' ? ' ' : GLYPHS[Math.floor(hash(frame + frameSalt, i) * GLYPHS.length)];
  }
  e.textContent = s;
}
