import * as THREE from 'three';
import { createHat, IDEAL } from './hat.js';
import { createKid } from './kid.js';
import { createHand } from './hands.js';
import { sfx, initAudio } from './audio.js';

// ---------------------------------------------------------------------------
// むずかしさ設定
//   time  : 各ステップの制限時間（秒）[ひっぱる, まわす, ツバ, かぶせる]
//   tol   : 判定のあまさ（大きいほどあまい）
//   relax : 手をはなしている間に布がもどる速さ
//   wobble: 勝手にゆれる強さ
//   sens  : スワイプの効き具合
// ---------------------------------------------------------------------------
const DIFFS = {
  easy:   { name: 'かんたん',   time: [15, 15, 15, 10], tol: 1.5, relax: 0.04, wobble: 0.0,  sens: 1.15 },
  normal: { name: 'ふつう',     time: [10, 10, 10, 8],  tol: 1.0, relax: 0.1,  wobble: 0.12, sens: 1.0 },
  hard:   { name: 'むずかしい', time: [7, 7, 7, 6],     tol: 0.7, relax: 0.2,  wobble: 0.3,  sens: 0.9 },
};

// hint: 左手・右手の矢印と、その向き（dx, dy）
const PHASES = [
  {
    key: 'pull', title: 'STEP 1　ひっぱる', handRest: [1.45, 1.0, 0.5],
    hint: { L: ['←', -1, 0], R: ['→', 1, 0] },
    desc: '左右に<b>外側へスワイプ</b>！内側の赤い布を引っぱり出して風船にしよう',
  },
  {
    key: 'turn', title: 'STEP 2　まわす', handRest: [1.5, 0.9, 0.7],
    hint: { L: ['↑', 0, -1], R: ['←', -1, 0] },
    desc: '<b>上スワイプ</b>でツバを上に、<b>左スワイプ</b>で白を左・赤を右に向けよう',
  },
  {
    key: 'brim', title: 'STEP 3　ツバをととのえる', handRest: [1.3, 1.6, 0.7],
    hint: { L: ['→', 1, 0], R: ['←', -1, 0] },
    desc: '左右から<b>内側にスワイプ</b>！ツバをピンととがらせよう',
  },
  {
    key: 'put', title: 'STEP 4　かぶせる', handRest: [1.6, 0.6, 1.8],
    hint: { L: ['↑', 0, -1], R: ['↑', 0, -1] },
    desc: '<b>上にスワイプ</b>して、下から友だちの頭にかぶせよう！',
  },
];

// 机の上の帽子は少しななめに置く（真正面だとツバが線にしか見えないため）
const HAT_YAW = -0.45;

// 頭にのせたときの位置と大きさ（頭のローカル座標）
const HAT_ON_HEAD = { pos: new THREE.Vector3(0, 0.08, 0), scale: 0.9 };

// 各ステップで帽子をもつ位置
const HAT_POS = {
  pull: new THREE.Vector3(0, 1.15, 0),
  turn: new THREE.Vector3(0, 1.15, 0),
  brim: new THREE.Vector3(0, 1.0, 0),
  put: new THREE.Vector3(0, 0.6, 1.9),
};

const RANKS = [
  { min: 85, rank: 'S', pose: 'specium', name: '完ぺきウルトラマン', shout: 'シュワッチ!!', sub: 'スペシウム光線！' },
  { min: 65, rank: 'A', pose: 'shuwatch', name: 'ほぼウルトラマン', shout: 'シュワッチ！', sub: 'ウルトラマンっぽい！' },
  { min: 40, rank: 'B', pose: 'ehehe', name: 'ウルトラマン見習い', shout: 'えへへ…', sub: 'ウルトラマン…かな？' },
  { min: 0, rank: 'C', pose: 'sad', name: 'ただの赤白帽', shout: 'これ…なに…？', sub: 'ただの帽子だよ…' },
];

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------
// three.js の基本
// ---------------------------------------------------------------------------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf3e6c8);
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);

scene.add(new THREE.HemisphereLight(0xffffff, 0xc9a77a, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 2.0);
sun.position.set(3, 7, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 25 });
sun.shadow.bias = -0.0005;
scene.add(sun);

const { desk } = buildRoom();

const hat = createHat();
scene.add(hat.group);

const hands = [createHand(-1), createHand(1)];
hands.forEach((h, i) => {
  const side = i === 0 ? -1 : 1;
  h.side = side;
  h.offset = new THREE.Vector2();
  h.pos = new THREE.Vector3(side * 4, -2, 1.5);
  h.pivot.rotation.y = -side * Math.PI / 2;
  scene.add(h.group);
});

const kid = createKid();
kid.root.visible = false;
scene.add(kid.root);

// お手本用の小さなシーン
const sampleScene = new THREE.Scene();
sampleScene.background = new THREE.Color(0xfffaf0);
sampleScene.add(new THREE.HemisphereLight(0xffffff, 0xc9a77a, 1.7));
const sampleSun = new THREE.DirectionalLight(0xffffff, 1.8);
sampleSun.position.set(2, 5, 4);
sampleScene.add(sampleSun);
const sampleHat = createHat();
sampleHat.reset({ ...IDEAL });
sampleScene.add(sampleHat.group);
const sampleCam = new THREE.PerspectiveCamera(32, 1, 0.1, 20);
sampleCam.position.set(0, 1.0, 5.2);
sampleCam.lookAt(0, 0.4, 0);

// エフェクト
const fx = new THREE.Group();
scene.add(fx);
let beam = null;
let confetti = null;

// ---------------------------------------------------------------------------
// カメラ
// ---------------------------------------------------------------------------
const VIEWS = {
  table: { pos: new THREE.Vector3(0, 3.2, 5.2), look: new THREE.Vector3(0, 0.9, 0), halfW: 1.9, minFov: 44 },
  put: { pos: new THREE.Vector3(0, 4.8, 5.9), look: new THREE.Vector3(0, 0.6, -1.2), halfW: 2.1, minFov: 48 },
  kid: { pos: new THREE.Vector3(1.3, 1.2, 3.4), look: new THREE.Vector3(-0.2, 0.0, -2.6), halfW: 2.3, minFov: 42 },
  result: { pos: new THREE.Vector3(1.3, 1.2, 3.4), look: new THREE.Vector3(-0.2, -1.7, -2.6), halfW: 2.6, minFov: 50 },
};
const cam = {
  from: VIEWS.table, to: VIEWS.table, t: 1, dur: 1,
  pos: new THREE.Vector3(), look: new THREE.Vector3(), shake: 0,
};
function moveCamera(view, dur = 1.2) {
  cam.from = { pos: cam.pos.clone(), look: cam.look.clone(), halfW: cam.halfW, minFov: cam.minFov };
  cam.to = view;
  cam.t = 0;
  cam.dur = dur;
}
function updateCamera(dt) {
  cam.t = Math.min(1, cam.t + dt / cam.dur);
  const e = ease(cam.t);
  cam.pos.lerpVectors(cam.from.pos, cam.to.pos, e);
  cam.look.lerpVectors(cam.from.look, cam.to.look, e);
  cam.halfW = lerp(cam.from.halfW, cam.to.halfW, e);
  cam.minFov = lerp(cam.from.minFov, cam.to.minFov, e);
  camera.position.copy(cam.pos);
  if (cam.shake > 0) {
    cam.shake = Math.max(0, cam.shake - dt * 2);
    camera.position.x += (Math.random() - 0.5) * cam.shake * 0.25;
    camera.position.y += (Math.random() - 0.5) * cam.shake * 0.25;
  }
  camera.lookAt(cam.look);
  const dist = cam.pos.distanceTo(cam.look);
  const need = THREE.MathUtils.radToDeg(2 * Math.atan(cam.halfW / dist / camera.aspect));
  camera.fov = Math.max(cam.minFov, need);
  camera.updateProjectionMatrix();
}
cam.pos.copy(VIEWS.table.pos);
cam.look.copy(VIEWS.table.look);
cam.halfW = VIEWS.table.halfW;
cam.minFov = VIEWS.table.minFov;
cam.from = VIEWS.table;

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------------------
// ゲーム状態
// ---------------------------------------------------------------------------
const G = {
  mode: 'title', // title | intro | play | phaseEnd | flight | reveal | pose | result
  modeT: 0,
  diffKey: 'normal',
  diff: DIFFS.normal,
  phase: 0,
  timer: 0,
  scores: [0, 0, 0],
  crumple: 0,
  putAcc: 0,
  baseWrinkle: 0.3,
  seed: 0,
  total: 0,
  rank: RANKS[3],
};

function setMode(m) {
  G.mode = m;
  G.modeT = 0;
}

function resetGame() {
  G.phase = 0;
  G.scores = [0, 0, 0];
  G.crumple = 0;
  G.putAcc = 0;
  G.seed = Math.random() * 100;
  G.baseWrinkle = 0.25 + Math.random() * 0.15;
  const rnd = (lo, hi) => (lo + Math.random() * (hi - lo)) * (Math.random() < 0.5 ? -1 : 1);

  scene.attach(hat.group);
  hat.group.position.set(0, 0.03, 0);
  hat.group.rotation.set(0, HAT_YAW, 0);
  hat.group.scale.setScalar(1);
  hat.reset({
    pull: 0, skew: rnd(0.1, 0.2), tip: 0, turn: 0, pinch: 0, lean: rnd(0.12, 0.25),
    wrinkle: G.baseWrinkle, worn: 0,
  });

  desk.position.set(0, 0, 0);
  kid.root.visible = false;
  kid.root.position.set(5, -1.6, -2.6);
  kid.root.rotation.set(0, 0, 0);
  kid.setPose('idle', true);
  clearFx();

  cam.pos.copy(VIEWS.table.pos);
  cam.look.copy(VIEWS.table.look);
  cam.halfW = VIEWS.table.halfW;
  cam.minFov = VIEWS.table.minFov;
  moveCamera(VIEWS.table, 0.01);
}

function startGame(diffKey) {
  initAudio();
  G.diffKey = diffKey;
  G.diff = DIFFS[diffKey];
  resetGame();
  $('title').classList.add('hidden');
  $('result').classList.add('hidden');
  sfx.start();
  startPhase(0);
}

function startPhase(i) {
  G.phase = i;
  const ph = PHASES[i];
  G.timer = G.diff.time[i];
  G.putAcc = 0;
  pointers.clear();
  $('hud').classList.remove('hidden');
  $('phaseTitle').textContent = ph.title;
  $('phaseDesc').innerHTML = ph.desc;
  for (const side of ['L', 'R']) {
    const el = $('hints').querySelector(`.${side}`);
    const [arrow, hx, hy] = ph.hint[side];
    el.textContent = arrow;
    el.style.setProperty('--dx', `${hx * 18}px`);
    el.style.setProperty('--dy', `${hy * 18}px`);
  }
  $('okBtn').textContent = ph.key === 'put' ? 'かぶせる！' : 'できた！';
  buildGauges();
  if (ph.key === 'put') {
    kid.root.visible = true;
    kid.root.position.set(5, -1.6, -2.6);
    kid.setPose('ready');
    moveCamera(VIEWS.put, 0.9);
  }
  showBanner(`${ph.title.replace('　', '\n')}`);
  setMode('intro');
}

// ---------------------------------------------------------------------------
// 採点
// ---------------------------------------------------------------------------
const sc = (err, width) => clamp(1 - err / width, 0, 1);
function widths() {
  const t = G.diff.tol;
  return { pull: 0.45 * t, skew: 0.4 * t, tip: 0.4 * t, turn: 0.4 * t, pinch: 0.5 * t, lean: 0.4 * t };
}
function phaseScore(i) {
  const s = hat.state;
  const w = widths();
  if (i === 0) return 0.6 * sc(Math.abs(s.pull - 1), w.pull) + 0.4 * sc(Math.abs(s.skew), w.skew);
  if (i === 1) return 0.5 * sc(Math.abs(s.tip - 1), w.tip) + 0.5 * sc(Math.abs(s.turn - 1), w.turn);
  if (i === 2) return 0.55 * sc(Math.abs(s.pinch - 1), w.pinch) + 0.45 * sc(Math.abs(s.lean), w.lean);
  return 1;
}

// ---------------------------------------------------------------------------
// ゲージ表示
// ---------------------------------------------------------------------------
let gauges = [];
function buildGauges() {
  const w = widths();
  const s = hat.state;
  const defs = {
    pull: [
      { label: 'ふくらみ', get: () => s.pull, min: 0, max: 1.5, target: 1, half: w.pull * 0.3, warn: 'のばしすぎ' },
      { label: 'バランス', get: () => s.skew, min: -0.8, max: 0.8, target: 0, half: w.skew * 0.3 },
    ],
    turn: [
      { label: 'ツバの向き（たて）', get: () => s.tip, min: 0, max: 1.5, target: 1, half: w.tip * 0.3, warn: 'まわしすぎ' },
      { label: '白赤の向き（よこ）', get: () => s.turn, min: -0.5, max: 1.5, target: 1, half: w.turn * 0.3, warn: 'まわしすぎ' },
    ],
    brim: [
      { label: 'ピン度', get: () => s.pinch, min: 0, max: 1.6, target: 1, half: w.pinch * 0.3, warn: 'つまみすぎ' },
      { label: 'かたむき', get: () => s.lean, min: -0.8, max: 0.8, target: 0, half: w.lean * 0.3 },
    ],
    put: [],
  }[PHASES[G.phase].key];

  const box = $('gauges');
  box.innerHTML = '';
  gauges = defs.map((d) => {
    const el = document.createElement('div');
    el.className = 'gauge';
    const pct = (v) => ((v - d.min) / (d.max - d.min)) * 100;
    const zl = pct(d.target - d.half);
    const zr = pct(d.target + d.half);
    el.innerHTML = `
      <div class="lbl"><span>${d.label}</span><span class="st"></span></div>
      <div class="bar">
        <div class="zone" style="left:${zl}%;width:${zr - zl}%"></div>
        ${d.danger ? `<div class="danger" style="left:${pct(d.danger)}%"></div>` : ''}
        <div class="mark"></div>
      </div>`;
    box.appendChild(el);
    return { d, el, mark: el.querySelector('.mark'), st: el.querySelector('.st'), pct };
  });
}
function updateGauges() {
  for (const g of gauges) {
    const v = g.d.get();
    g.mark.style.left = `${clamp(g.pct(v), 0, 100)}%`;
    const good = Math.abs(v - g.d.target) <= g.d.half;
    g.el.classList.toggle('good', good);
    let st = good ? 'いい感じ！' : '';
    if (!good && g.d.warn && v > g.d.target + g.d.half * 2.5) st = g.d.warn;
    if (g.d.danger && v > g.d.danger - 0.12) st = 'あぶない！';
    g.st.textContent = st;
  }
}

// ---------------------------------------------------------------------------
// 入力（左右の画面半分でそれぞれの手）
// ---------------------------------------------------------------------------
const pointers = new Map();
canvas.addEventListener('pointerdown', (e) => {
  if (G.mode !== 'play') return;
  const side = e.clientX < window.innerWidth / 2 ? -1 : 1;
  pointers.set(e.pointerId, { side, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
  try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* noop */ }
});
canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const H = window.innerHeight;
  const dx = (e.clientX - p.x) / H;
  const dy = (e.clientY - p.y) / H;
  p.x = e.clientX;
  p.y = e.clientY;
  if (G.mode === 'play') onDrag(p.side, dx, dy);
});
const endPointer = (e) => pointers.delete(e.pointerId);
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
document.addEventListener('gesturestart', (e) => e.preventDefault());

function handActive(side) {
  for (const p of pointers.values()) if (p.side === side) return p;
  return null;
}

function onDrag(side, dx, dy) {
  const s = hat.state;
  const k = G.diff.sens;
  const key = PHASES[G.phase].key;
  if (key === 'pull') {
    const outward = dx * side;
    s.pull = clamp(s.pull + outward * 2.0 * k, 0, 1.5);
    s.skew = clamp(s.skew + outward * 1.2 * k * side, -0.8, 0.8);
    if (s.pull > 1.2 && outward > 0) G.crumple += outward * 0.3;
    if (Math.abs(dx) > 0.003) sfx.swipe(s.pull * 0.4);
  } else if (key === 'turn') {
    s.tip = clamp(s.tip - dy * 2.2 * k, -0.3, 1.6);
    s.turn = clamp(s.turn - dx * 2.2 * k, -0.6, 1.6);
    if (Math.abs(dx) + Math.abs(dy) > 0.003) sfx.swipe((s.tip + s.turn) * 0.2);
  } else if (key === 'brim') {
    const inward = dx * -side;
    s.pinch = clamp(s.pinch + inward * 2.2 * k, 0, 1.6);
    s.lean = clamp(s.lean + inward * 1.4 * k * -side, -0.8, 0.8);
    if (s.pinch > 1.2 && inward > 0) G.crumple += inward * 0.35;
    if (Math.abs(dx) > 0.003) sfx.swipe(s.pinch * 0.4);
  } else if (key === 'put') {
    G.putAcc += -dy;
    if (G.putAcc > 0.12) putHat();
  }
}

$('okBtn').addEventListener('click', () => {
  if (G.mode !== 'play') return;
  if (PHASES[G.phase].key === 'put') putHat();
  else endPhase();
});

// ---------------------------------------------------------------------------
// 進行
// ---------------------------------------------------------------------------
function endPhase() {
  const i = G.phase;
  const score = phaseScore(i);
  G.scores[i] = score;
  pointers.clear();
  const pts = Math.round(score * 100);
  const word = pts >= 85 ? 'カンペキ！' : pts >= 65 ? 'いいね！' : pts >= 40 ? 'まあまあ' : 'うーん…';
  showBanner(`${word}\n<small>${pts}点</small>`, '', 900);
  sfx.phaseEnd(pts >= 65);
  setMode('phaseEnd');
}

function putHat() {
  if (G.mode !== 'play') return;
  pointers.clear();
  sfx.whoosh();
  $('hud').classList.add('hidden');
  G.flightFrom = hat.group.position.clone();
  G.flightYaw = hat.group.rotation.y;
  setMode('flight');
}

function computeResult() {
  const avg = (G.scores[0] + G.scores[1] + G.scores[2]) / 3;
  const penalty = Math.min(0.35, G.crumple);
  G.total = Math.round(avg * 100 * (1 - penalty));
  G.rank = RANKS.find((r) => G.total >= r.min);
}

function showResult() {
  const r = G.rank;
  $('rank').textContent = r.rank;
  $('rankName').textContent = r.name;
  $('total').innerHTML = `<b>${G.total}</b> 点（${G.diff.name}）`;
  const items = [
    ['ひっぱる', G.scores[0]],
    ['まわす', G.scores[1]],
    ['ツバ', G.scores[2]],
  ];
  let html = items.map(([n, v]) => `
    <div class="item"><span>${n}</span><div class="bar"><i style="width:${Math.round(v * 100)}%"></i></div><span>${Math.round(v * 100)}</span></div>`).join('');
  const notes = [];
  if (G.crumple > 0.02) notes.push(`しわしわ −${Math.round(Math.min(0.35, G.crumple) * 100)}%`);
  if (notes.length) html += `<div class="note">${notes.join('　')}</div>`;
  $('breakdown').innerHTML = html;
  $('result').classList.remove('hidden');
}

$('title').querySelectorAll('button[data-diff]').forEach((b) => {
  b.addEventListener('click', () => startGame(b.dataset.diff));
});
$('retryBtn').addEventListener('click', () => startGame(G.diffKey));
$('menuBtn').addEventListener('click', () => {
  $('result').classList.add('hidden');
  $('title').classList.remove('hidden');
  resetGame();
  setMode('title');
});

// ---------------------------------------------------------------------------
// バナー
// ---------------------------------------------------------------------------
let bannerTimer = 0;
function showBanner(html, cls = '', ms = 1100) {
  const b = $('banner');
  b.className = cls;
  b.innerHTML = html.replace(/\n/g, '<br>');
  void b.offsetWidth; // アニメーションをやり直す
  b.style.animation = 'none';
  void b.offsetWidth;
  b.style.animation = '';
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => b.classList.add('hidden'), ms);
}
function flash() {
  const f = $('flash');
  f.style.transition = 'none';
  f.style.opacity = '0.9';
  void f.offsetWidth;
  f.style.transition = 'opacity 0.6s';
  f.style.opacity = '0';
}

// ---------------------------------------------------------------------------
// 毎フレームの処理
// ---------------------------------------------------------------------------
const noise = (t, a) => Math.sin(t * 1.3 + a) + 0.6 * Math.sin(t * 3.1 + a * 1.7) + 0.3 * Math.sin(t * 7.3 + a * 2.3);

function updatePlay(dt, t) {
  const s = hat.state;
  const d = G.diff;
  const key = PHASES[G.phase].key;
  const touching = pointers.size > 0;

  if (key === 'pull') {
    // 手をはなすと赤い布が内側へもどろうとする
    if (!touching) s.pull = Math.max(0, s.pull - d.relax * dt * (0.5 + s.pull));
    s.skew = clamp(s.skew + d.wobble * noise(t, G.seed) * dt * 0.35, -0.8, 0.8);
  } else if (key === 'turn') {
    s.tip = clamp(s.tip + d.wobble * noise(t, G.seed + 3) * dt * 0.4, -0.3, 1.6);
    s.turn = clamp(s.turn + d.wobble * noise(t, G.seed + 7) * dt * 0.4, -0.6, 1.6);
  } else if (key === 'brim') {
    if (!touching) s.pinch = Math.max(0, s.pinch - d.relax * dt * 0.8);
    s.lean = clamp(s.lean + d.wobble * noise(t, G.seed + 5) * dt * 0.35, -0.8, 0.8);
  }
  // しわ：つまむほどのびる。のばしすぎ・つまみすぎの「くしゃっ」は残る
  s.wrinkle = G.baseWrinkle * (1 - clamp(s.pinch, 0, 1) * 0.85) + Math.min(0.6, G.crumple);

  const before = G.timer;
  G.timer -= dt;
  if (G.timer <= 3 && Math.ceil(G.timer) !== Math.ceil(before) && G.timer > 0) sfx.tick();
  if (G.timer <= 0) {
    G.timer = 0;
    if (key === 'put') putHat();
    else endPhase();
  }

  const total = G.diff.time[G.phase];
  const fill = $('timerFill');
  fill.style.width = `${(G.timer / total) * 100}%`;
  fill.classList.toggle('warn', G.timer <= 3);
  const tt = $('timeText');
  tt.textContent = `${G.timer.toFixed(1)}`;
  tt.classList.toggle('warn', G.timer <= 3);
  updateGauges();
}

function updateHands(dt, t) {
  const playing = G.mode === 'play' || G.mode === 'intro' || G.mode === 'phaseEnd';
  const ph = PHASES[G.phase];
  const H = window.innerHeight;
  for (const h of hands) {
    const p = playing ? handActive(h.side) : null;
    if (p) {
      h.offset.set(clamp(((p.x - p.sx) / H) * 3.2, -1.1, 1.1), clamp((-(p.y - p.sy) / H) * 3.2, -1.0, 1.2));
    } else {
      h.offset.multiplyScalar(Math.exp(-dt * 8));
    }
    const rest = playing ? ph.handRest : [2.2, -2.5, 1.6];
    const target = new THREE.Vector3(
      h.side * rest[0] + h.offset.x,
      rest[1] + h.offset.y + Math.sin(t * 2 + h.side) * 0.03,
      rest[2] - (p ? 0.25 : 0),
    );
    if (!playing) target.x = h.side * 4;
    h.pos.lerp(target, 1 - Math.exp(-dt * 14));
    h.group.position.copy(h.pos);
    h.group.rotation.set(-0.35, 0, h.side * 0.55);
    h.setCurl(p ? 1 : 0.15);
  }
}

function updateFlight(dt) {
  const T = 0.95;
  const k = clamp(G.modeT / T, 0, 1);
  const e = ease(k);
  const target = kid.head.localToWorld(HAT_ON_HEAD.pos.clone());
  hat.group.position.lerpVectors(G.flightFrom, target, e);
  hat.group.position.y += Math.sin(Math.PI * k) * 1.4;
  hat.group.rotation.y = lerp(G.flightYaw, Math.PI * 2 + kid.root.rotation.y, e);
  hat.group.scale.setScalar(lerp(1, HAT_ON_HEAD.scale, e));
  // 頭にのる直前から、下半分が内側へ押しこまれていく
  hat.state.worn = clamp((k - 0.6) / 0.4, 0, 1);
  if (k >= 1) {
    kid.head.attach(hat.group);
    hat.group.position.copy(HAT_ON_HEAD.pos);
    hat.group.rotation.set(0, 0, 0);
    hat.group.scale.setScalar(HAT_ON_HEAD.scale);
    computeResult();
    sfx.phaseEnd(true);
    moveCamera(VIEWS.kid, 1.3);
    setMode('reveal');
  }
}

function startPose() {
  const r = G.rank;
  kid.setPose(r.pose);
  setMode('pose');
}

function spawnEffects() {
  const r = G.rank;
  showBanner(`${r.shout}\n<small>${r.sub}</small>`, `low ${r.rank === 'S' || r.rank === 'A' ? 'red' : ''}`, 2400);
  sfx.result(r.rank);
  if (r.rank === 'S') {
    flash();
    cam.shake = 0.5;
    beam = makeBeam();
    kid.root.add(beam);
  }
  if (r.rank === 'S' || r.rank === 'A') confetti = makeConfetti();
}

function makeBeam() {
  const g = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.09, 1, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xe8f8ff }),
  );
  const glow = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.22, 1, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x7fd4ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  core.position.y = glow.position.y = 0.5;
  g.add(core, glow);
  g.userData = { core, glow, len: 0 };
  return g;
}

function makeConfetti() {
  const colors = [0xd8262c, 0xffffff, 0xf8d045, 0x3c8dde, 0x3cb371];
  const geo = new THREE.PlaneGeometry(0.09, 0.14);
  const list = [];
  for (let i = 0; i < 90; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide }));
    m.position.set((Math.random() - 0.5) * 5, 2.5 + Math.random() * 3, -2.6 + (Math.random() - 0.5) * 3);
    m.userData = {
      vy: -0.6 - Math.random() * 0.8,
      spin: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6),
      sway: Math.random() * 6,
    };
    fx.add(m);
    list.push(m);
  }
  return list;
}

function clearFx() {
  if (beam) { beam.parent?.remove(beam); beam = null; }
  fx.clear();
  confetti = null;
}

function updateFx(dt, t) {
  if (beam) {
    const ud = beam.userData;
    ud.len = Math.min(9, ud.len + dt * 20);
    const E = kid.points.rE;
    const Hd = kid.points.rH;
    const origin = E.clone().lerp(Hd, 0.55);
    const dir = new THREE.Vector3(-0.9, 0.03, 1).normalize();
    beam.position.copy(origin).addScaledVector(dir, 0.1);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    beam.scale.set(1 + Math.sin(t * 50) * 0.15, ud.len, 1 + Math.sin(t * 50) * 0.15);
  }
  if (confetti) {
    for (const m of confetti) {
      const u = m.userData;
      m.position.y += u.vy * dt;
      m.position.x += Math.sin(t * 2 + u.sway) * dt * 0.4;
      m.rotation.x += u.spin.x * dt;
      m.rotation.y += u.spin.y * dt;
      if (m.position.y < -1.6) m.position.y = 3.5;
    }
  }
}

const clock = new THREE.Clock();
let elapsed = 0;

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;
  const t = elapsed;
  G.modeT += dt;

  switch (G.mode) {
    case 'title':
      hat.group.rotation.y = HAT_YAW + Math.sin(t * 0.8) * 0.4;
      break;
    case 'intro':
      if (G.modeT > 1.0) setMode('play');
      holdHat(dt);
      if (PHASES[G.phase].key === 'put') updateKidEnter(dt);
      break;
    case 'play':
      updatePlay(dt, t);
      holdHat(dt);
      if (PHASES[G.phase].key === 'put') updateKidEnter(dt);
      break;
    case 'phaseEnd':
      if (G.modeT > 1.0) startPhase(G.phase + 1);
      break;
    case 'flight':
      updateFlight(dt);
      break;
    case 'reveal': {
      const k = ease(clamp(G.modeT / 1.2, 0, 1));
      desk.position.x = lerp(0, 9, k);
      kid.root.rotation.y = lerp(0, -0.2, k);
      if (G.modeT > 1.3) startPose();
      break;
    }
    case 'pose':
      if (G.modeT > 0.55 && !G.fxDone) { G.fxDone = true; spawnEffects(); }
      if (G.modeT > 3.2) {
        moveCamera(VIEWS.result, 0.8);
        showResult();
        setMode('result');
      }
      break;
    default:
      break;
  }
  if (G.mode !== 'pose') G.fxDone = G.mode === 'result';

  hat.update();
  updateHands(dt, t);
  if (kid.root.visible) kid.update(dt, t);
  updateFx(dt, t);
  updateCamera(dt);

  renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
  renderer.render(scene, camera);
  renderSample(t);
  requestAnimationFrame(frame);
}

// 両手でもち上げた帽子を、ステップごとの位置へ
function holdHat(dt) {
  const target = HAT_POS[PHASES[G.phase].key];
  hat.group.position.lerp(target, 1 - Math.exp(-dt * 4));
}

function updateKidEnter(dt) {
  // 右からかけよってくる
  const x = kid.root.position.x;
  kid.root.position.x = x + (0 - x) * (1 - Math.exp(-dt * 4));
}

function renderSample(t) {
  if ($('hud').classList.contains('hidden') || PHASES[G.phase].key === 'put') {
    $('sample').style.visibility = 'hidden';
    return;
  }
  const el = $('sample');
  el.style.visibility = 'visible';
  const r = el.getBoundingClientRect();
  const b = 3; // 枠線の内側に描く
  const x = r.left + b;
  const y = window.innerHeight - r.bottom + b;
  const w = r.width - b * 2;
  const h = r.height - b * 2;
  sampleHat.group.rotation.y = HAT_YAW + Math.sin(t * 0.9) * 0.4;
  sampleCam.aspect = w / h;
  sampleCam.updateProjectionMatrix();
  renderer.setScissorTest(true);
  renderer.setScissor(x, y, w, h);
  renderer.setViewport(x, y, w, h);
  renderer.render(sampleScene, sampleCam);
  renderer.setScissorTest(false);
}

// ---------------------------------------------------------------------------
// 教室
// ---------------------------------------------------------------------------
function buildRoom() {
  const floorTex = makeCanvasTexture(256, 256, (c, w, h) => {
    c.fillStyle = '#c99a62';
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) {
      c.fillStyle = i % 2 ? '#c28f55' : '#cfa36c';
      c.fillRect(0, (i * h) / 8, w, h / 8 - 2);
    }
  });
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(6, 6);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.6;
  floor.receiveShadow = true;
  scene.add(floor);

  const wall = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), new THREE.MeshStandardMaterial({ color: 0xf6ecd6, roughness: 1 }));
  wall.position.set(0, 6, -7);
  scene.add(wall);
  const skirting = new THREE.Mesh(new THREE.BoxGeometry(40, 0.4, 0.1), new THREE.MeshStandardMaterial({ color: 0x9b7048 }));
  skirting.position.set(0, -1.4, -6.95);
  scene.add(skirting);

  const boardTex = makeCanvasTexture(1024, 384, (c, w, h) => {
    c.fillStyle = '#2f5d43';
    c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.font = '800 84px "M PLUS Rounded 1c", sans-serif';
    c.textAlign = 'center';
    c.fillText('ウルトラマンを', w / 2, 150);
    c.fillText('つくろう！', w / 2, 270);
    c.font = '500 36px "M PLUS Rounded 1c", sans-serif';
    c.textAlign = 'right';
    c.fillText('日直　あかしろ', w - 40, h - 30);
  });
  const board = new THREE.Mesh(new THREE.BoxGeometry(7.2, 2.7, 0.1), [
    ...Array(4).fill(new THREE.MeshStandardMaterial({ color: 0x7a5232 })),
    new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.95 }),
    new THREE.MeshStandardMaterial({ color: 0x7a5232 }),
  ]);
  board.position.set(0, 2.9, -6.9);
  scene.add(board);
  document.fonts?.ready.then(() => {
    boardTex.userData.redraw();
    boardTex.needsUpdate = true;
  });

  // 学校の机
  const desk = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.12, 2.6), new THREE.MeshStandardMaterial({ color: 0xe2b57e, roughness: 0.7 }));
  top.position.y = -0.06;
  top.receiveShadow = true;
  top.castShadow = true;
  desk.add(top);
  const edge = new THREE.Mesh(new THREE.BoxGeometry(3.84, 0.06, 2.64), new THREE.MeshStandardMaterial({ color: 0xa8784a }));
  edge.position.y = -0.15;
  desk.add(edge);
  const metal = new THREE.MeshStandardMaterial({ color: 0x9aa1a8, roughness: 0.4, metalness: 0.5 });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.45, 10), metal);
      leg.position.set(sx * 1.7, -0.9, sz * 1.1);
      leg.castShadow = true;
      desk.add(leg);
    }
  }
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.05, 2.0), metal);
  shelf.position.set(0, -0.45, -0.2);
  desk.add(shelf);
  scene.add(desk);
  return { desk };
}

function makeCanvasTexture(w, h, draw) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c = cv.getContext('2d');
  draw(c, w, h);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData.redraw = () => draw(c, w, h);
  return tex;
}

// ---------------------------------------------------------------------------
resetGame();
requestAnimationFrame(frame);

// デバッグ・テスト用
window.__game = { G, hat, kid, startGame, putHat, endPhase, PHASES };
