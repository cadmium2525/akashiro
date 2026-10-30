import * as THREE from 'three';

// 赤白帽子：白い布と赤い布の2枚を、外周（ふち）だけで縫い合わせた帽子。前にツバがある。
// ふだんは赤い布が白い布の内側にかさなっているが、内側の赤を引っぱり出すと
// 白と赤が半分ずつの「風船」になり、縫い目からツバが飛び出す。
// それをツバが上に来るように回し、下から頭にかぶせるとウルトラマン。
//
// 帽子のローカル座標：ふち（縫い目）は xz 平面の半径1の円、白はふだん +y 側にふくらむ、ツバは +z（前）。
// state:
//   pull   : 0 = 赤が内側 / 1 = 赤が外に出て風船 / >1 = のばしすぎ
//   skew   : 引っぱりのかたより（0 が正解）
//   tip    : ツバを前から上へ（1 で真上）
//   turn   : 白の面を左へ向ける回転（1 で白が左・赤が右）
//   pinch  : ツバのピン度（0 = ふにゃっ / 1 = ピンととがる / >1 = つまみすぎ）
//   lean   : ツバのかたむき（0 が正解）
//   wrinkle: しわ
//   worn   : 0 = 風船 / 1 = 下半分が内側に押しこまれた（頭にかぶった）状態

const RED = 0xd8262c;
const WHITE = 0xf7f5ef;
const GRAY = 0x8c9097;

const SEG_A = 48; // ふち方向
const SEG_P = 16; // てっぺん→ふち方向
const BALL_H = 0.9; // ふくらみの高さ（ふちの半径に対する比）
const BRIM_A = 0.62; // ツバがふちにそっている角度（半分）
const BRIM_U = 24;
const BRIM_V = 10;

export const IDEAL = { pull: 1, skew: 0, tip: 1, turn: 1, pinch: 1, lean: 0, wrinkle: 0, worn: 0 };

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);

// ウルトラマンのトサカのような、とがった輪郭（a: -1..1）
function crest(a) {
  return Math.pow(Math.max(0, 1 - Math.pow(Math.abs(a), 1.4)), 0.75);
}

function makeGrid(nu, nv, flip = false) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array((nu + 1) * (nv + 1) * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const idx = [];
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const a = i * (nv + 1) + j;
      const b = a + nv + 1;
      if (flip) idx.push(a, b, a + 1, b, b + 1, a + 1);
      else idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  geo.setIndex(idx);
  return { geo, pos };
}

export function createHat() {
  const group = new THREE.Group();

  const whiteMat = new THREE.MeshStandardMaterial({ color: WHITE, roughness: 0.92, side: THREE.DoubleSide });
  const redMat = new THREE.MeshStandardMaterial({ color: RED, roughness: 0.85, side: THREE.DoubleSide });
  const brimTopMat = new THREE.MeshStandardMaterial({ color: WHITE, roughness: 0.9, side: THREE.FrontSide });
  const brimBotMat = new THREE.MeshStandardMaterial({ color: RED, roughness: 0.85, side: THREE.BackSide });
  const seamMat = new THREE.MeshStandardMaterial({ color: 0xe9e4da, roughness: 0.9 });
  const bandMat = new THREE.MeshStandardMaterial({ color: GRAY, roughness: 0.55 });

  const white = makeGrid(SEG_A, SEG_P);
  const red = makeGrid(SEG_A, SEG_P);
  const brim = makeGrid(BRIM_U, BRIM_V, true);
  const whiteMesh = new THREE.Mesh(white.geo, whiteMat);
  const redMesh = new THREE.Mesh(red.geo, redMat);
  const brimTop = new THREE.Mesh(brim.geo, brimTopMat);
  const brimBot = new THREE.Mesh(brim.geo, brimBotMat);
  const seam = new THREE.Mesh(new THREE.BufferGeometry(), seamMat);
  const band = new THREE.Mesh(new THREE.BufferGeometry(), bandMat);
  for (const m of [whiteMesh, redMesh, brimTop, brimBot, seam, band]) {
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }

  const state = { pull: 0, skew: 0, tip: 0, turn: 0, pinch: 0, lean: 0, wrinkle: 0.2, worn: 0 };
  let lastKey = '';

  const M = new THREE.Matrix4();
  const Rx = new THREE.Matrix4();
  const v = new THREE.Vector3();

  // 帽子ローカル → 向きをつけた座標。かぶった状態では下半分を内側へ折り返す。
  function orient(x, y, z, fold = 0.9) {
    v.set(x, y, z).applyMatrix4(M);
    if (state.worn > 0 && v.y < 0) v.y = lerp(v.y, -v.y * fold, state.worn);
    return v;
  }
  function put(arr, k, x, y, z) {
    orient(x, y, z);
    arr[k] = v.x;
    arr[k + 1] = v.y;
    arr[k + 2] = v.z;
  }

  function build() {
    const s = state;
    M.makeRotationY(s.turn * (Math.PI / 2)).multiply(Rx.makeRotationX(-s.tip * (Math.PI / 2)));

    // 赤い布：内側（+y）から外側（-y）へひっくり返る
    const p = clamp(s.pull, 0, 1);
    const over = Math.max(0, s.pull - 1);
    const flipT = smooth(p);
    const redH = lerp(0.94, -1, flipT) - over * 0.5;
    const redR = lerp(0.965, 1, flipT);
    // 途中はくしゃっとする
    const crumple = Math.sin(Math.PI * p) * 0.12 + s.wrinkle * 0.12;

    for (let i = 0; i <= SEG_A; i++) {
      const phi = (i / SEG_A) * Math.PI * 2;
      const cx = Math.cos(phi);
      const cz = Math.sin(phi);
      for (let j = 0; j <= SEG_P; j++) {
        const th = (j / SEG_P) * (Math.PI / 2);
        const st = Math.sin(th);
        const ct = Math.cos(th);
        const k = (i * (SEG_P + 1) + j) * 3;
        const ww = 1 + s.wrinkle * 0.05 * Math.sin(phi * 7 + th * 5) * st;
        put(white.pos, k, st * cx * ww, ct * BALL_H * ww, st * cz * ww);
        const n = 1 + crumple * Math.sin(phi * 9 + th * 6) * st;
        const h = redH * BALL_H * (1 + s.skew * 0.5 * st * cx) * n;
        put(red.pos, k, st * cx * redR * n, ct * h, st * cz * redR * n);
      }
    }

    // ツバ：ふちの前（+z）から外へのびる
    const pk = clamp(s.pinch, 0, 1);
    const pOver = Math.max(0, s.pinch - 1);
    let c = (1 - pk) * 0.7 + pOver * 1.2 + s.wrinkle * 0.3;
    if (c < 1e-4) c = 1e-4;
    const ang0 = s.lean * 0.9;
    for (let i = 0; i <= BRIM_U; i++) {
      const a = -1 + (2 * i) / BRIM_U;
      const phi = Math.PI / 2 + a * BRIM_A;
      const cx = Math.cos(phi);
      const cz = Math.sin(phi);
      const depth = lerp(0.42 * Math.sqrt(Math.max(0, 1 - a * a)), 0.95 * crest(a), pk) * (1 - pOver * 0.3);
      for (let j = 0; j <= BRIM_V; j++) {
        const d = (j / BRIM_V) * depth;
        const ang = ang0 - c * d;
        const r = 1 + (Math.sin(ang0) - Math.sin(ang)) / c;
        let y = (Math.cos(ang) - Math.cos(ang0)) / c;
        y += s.wrinkle * 0.06 * Math.sin(a * 11 + j) * (j / BRIM_V);
        put(brim.pos, (i * (BRIM_V + 1) + j) * 3, cx * r, y, cz * r);
      }
    }

    for (const g of [white.geo, red.geo, brim.geo]) {
      g.attributes.position.needsUpdate = true;
      g.computeVertexNormals();
      g.computeBoundingSphere();
    }

    // 縫い目
    const seamPts = [];
    for (let i = 0; i < 48; i++) {
      const phi = (i / 48) * Math.PI * 2;
      seamPts.push(orient(Math.cos(phi), 0, Math.sin(phi)).clone());
    }
    seam.geometry.dispose();
    seam.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(seamPts, true), 96, 0.03, 6, true);

    // ゴム：ふちの左右をむすび、後ろ側・赤の側へたれる
    const bandPts = [];
    const sag = lerp(0.35, 0.75, flipT);
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const phi = Math.PI * t;
      const bx = Math.cos(phi);
      const bz = -Math.sin(phi) * 0.75;
      const by = -sag * Math.sin(Math.PI * t) * 0.6 - 0.02;
      bandPts.push(orient(bx, by, bz, 0.92).clone());
    }
    band.geometry.dispose();
    band.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(bandPts), 48, 0.025, 6, false);
  }

  function update(force = false) {
    const key = Object.values(state).map((x) => x.toFixed(3)).join(',');
    if (!force && key === lastKey) return;
    lastKey = key;
    build();
  }

  function reset(s) {
    Object.assign(state, s);
    update(true);
  }

  update(true);
  return { group, state, update, reset };
}
