// WebAudio で鳴らす簡単な効果音（音源ファイル不要）
let ctx = null;

export function initAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
}

function tone(freq, dur, { type = 'sine', vol = 0.12, delay = 0, slide = 0 } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur, vol = 0.3) {
  if (!ctx) return;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const src = ctx.createBufferSource();
  const g = ctx.createGain();
  g.gain.value = vol;
  src.buffer = buf;
  src.connect(g).connect(ctx.destination);
  src.start();
}

let lastSwipe = 0;
export const sfx = {
  swipe(pitch = 0) {
    if (!ctx || ctx.currentTime - lastSwipe < 0.08) return;
    lastSwipe = ctx.currentTime;
    tone(380 + pitch * 500 + Math.random() * 60, 0.06, { type: 'triangle', vol: 0.05 });
  },
  snap() {
    noise(0.12, 0.5);
    tone(900, 0.12, { type: 'square', vol: 0.08, slide: -700 });
  },
  start() {
    tone(523, 0.1, { type: 'square', vol: 0.06 });
    tone(784, 0.16, { type: 'square', vol: 0.06, delay: 0.1 });
  },
  phaseEnd(good) {
    if (good) {
      [659, 784, 1047].forEach((f, i) => tone(f, 0.12, { type: 'triangle', vol: 0.1, delay: i * 0.07 }));
    } else {
      tone(330, 0.2, { type: 'triangle', vol: 0.1 });
    }
  },
  tick() { tone(1200, 0.04, { type: 'square', vol: 0.03 }); },
  whoosh() { tone(200, 0.5, { type: 'sawtooth', vol: 0.04, slide: 600 }); },
  result(rank) {
    if (rank === 'S') {
      tone(220, 1.6, { type: 'sawtooth', vol: 0.05, slide: 1600 });
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.25, { type: 'square', vol: 0.05, delay: 0.5 + i * 0.1 }));
    } else if (rank === 'A') {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.2, { type: 'square', vol: 0.05, delay: i * 0.1 }));
    } else if (rank === 'B') {
      [523, 587, 523].forEach((f, i) => tone(f, 0.18, { type: 'triangle', vol: 0.08, delay: i * 0.15 }));
    } else {
      [392, 370, 349, 330].forEach((f, i) => tone(f, 0.3, { type: 'triangle', vol: 0.08, delay: i * 0.25 }));
    }
  },
};
