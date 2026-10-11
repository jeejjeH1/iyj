// Shared helpers: deterministic random, easing, timing.
export const PAL = {
  bg: '#0d0a08',
  black: '#0b0907',
  ink: '#16110d',
  dark: '#2b2019',
  brown: '#5a4334',
  mid: '#7a5c45',
  light: '#a8835f',   // light brown
  tan: '#c9a882',
  cream: '#efe2cc',
  white: '#ffffff',
};

export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return (s >>> 0) / 4294967296;
  };
}

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const seg = (t, a, b) => clamp((t - a) / (b - a));
export const smooth = (x) => x * x * (3 - 2 * x);

export const ease = {
  linear: (x) => x,
  inOut: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  out: (x) => 1 - Math.pow(1 - x, 3),
  outQuart: (x) => 1 - Math.pow(1 - x, 4),
  outExpo: (x) => (x === 1 ? 1 : 1 - Math.pow(2, -10 * x)),
  inExpo: (x) => (x === 0 ? 0 : Math.pow(2, 10 * x - 10)),
  in: (x) => x * x * x,
  inOutExpo: (x) =>
    x === 0 ? 0 : x === 1 ? 1 : x < 0.5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2,
  outBack: (x) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  },
  outElastic: (x) => {
    const c4 = (2 * Math.PI) / 3;
    return x === 0 ? 0 : x === 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1;
  },
};

// in/out envelope: 0 before a, ramps to 1 by a+fi, holds, ramps down to 0 by b
export function env(t, a, b, fi = 0.5, fo = 0.5, e = ease.out) {
  if (t < a || t > b) return 0;
  const i = fi > 0 ? e(seg(t, a, a + fi)) : 1;
  const o = fo > 0 ? 1 - ease.in(seg(t, b - fo, b)) : 1;
  return Math.min(i, o);
}
