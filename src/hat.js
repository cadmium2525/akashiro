import * as THREE from 'three';

// 赤白帽子。ドーム（白）＋折り上げた赤い部分（トサカ）＋ゴムひも。
// state の値を変えて update() を呼ぶと形が変わる。
//   fold    : 0 = ぺたんと寝ている / 1 = まっすぐ立つ / >1 = 反対側に倒れる
//   pinch   : 0 = ふにゃふにゃで丸い / 1 = ピンととがったトサカ / >1 = つまみすぎ
//   twist   : トサカのねじれ（0 が正解）
//   wrinkle : しわ
//   band    : 0 = ゴムがゆるんでいる / 0.9 前後 = ちょうどいい / 1.2 で切れる
//   bandTilt: ゴムのかたむき（0 が正解）

const RED = 0xd8262c;
const WHITE = 0xf7f5ef;
const GRAY = 0x8c9097;

const U_SEG = 32;
const V_SEG = 16;
const DOME_H = 0.82;   // ドームの高さ（半径1を縦につぶした値）

export const IDEAL = { fold: 1, pinch: 1, twist: 0, wrinkle: 0, band: 0.9, bandTilt: 0 };

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

function domeY(x, z) {
  const r2 = 1 - x * x - z * z;
  return r2 > 0 ? DOME_H * Math.sqrt(r2) : 0;
}

// ウルトラマンの頭のような、前が少し高いトサカの輪郭（u: -1..1）
function crest(u) {
  const a = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(u), 1.7)), 0.85);
  return a * (1 + 0.16 * u);
}

export function createHat() {
  const group = new THREE.Group();

  // 赤白帽子はリバーシブル：表（外側）が白、裏（内側）が赤。
  const outerMat = new THREE.MeshStandardMaterial({ color: WHITE, roughness: 0.92 });
  const innerMat = new THREE.MeshStandardMaterial({ color: RED, roughness: 0.85, side: THREE.BackSide });
  const flapOuterMat = new THREE.MeshStandardMaterial({ color: WHITE, roughness: 0.92, side: THREE.BackSide });
  const flapInnerMat = new THREE.MeshStandardMaterial({ color: RED, roughness: 0.85, side: THREE.FrontSide });
  const bandMat = new THREE.MeshStandardMaterial({ color: GRAY, roughness: 0.55 });

  // 動かない半分（-x 側）のドーム
  const domeGeo = new THREE.SphereGeometry(1, 32, 20, -Math.PI / 2, Math.PI, 0, Math.PI / 2);
  const dome = new THREE.Mesh(domeGeo, outerMat);
  dome.scale.y = DOME_H;
  dome.castShadow = true;
  dome.receiveShadow = true;
  const inner = new THREE.Mesh(domeGeo, innerMat);
  inner.scale.set(0.985, DOME_H * 0.985, 0.985);
  const hemGeo = new THREE.TorusGeometry(1.0, 0.03, 8, 40, Math.PI);
  hemGeo.rotateX(Math.PI / 2);
  hemGeo.rotateY(-Math.PI / 2);
  const hem = new THREE.Mesh(hemGeo, outerMat);
  hem.position.y = 0.02;
  hem.castShadow = true;
  group.add(dome, inner, hem);

  // 折り返す半分（+x 側）。fold=0 ではドームの半分そのもので、
  // 折り上げると裏返って赤い面が外に出たトサカになる。
  const finGeo = new THREE.BufferGeometry();
  const vCount = (U_SEG + 1) * (V_SEG + 1);
  const finPos = new Float32Array(vCount * 3);
  finGeo.setAttribute('position', new THREE.BufferAttribute(finPos, 3));
  const idx = [];
  for (let i = 0; i < U_SEG; i++) {
    for (let j = 0; j < V_SEG; j++) {
      const a = i * (V_SEG + 1) + j;
      const b = a + V_SEG + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  finGeo.setIndex(idx);
  const finGroup = new THREE.Group();
  const finOuter = new THREE.Mesh(finGeo, flapOuterMat);
  const finInner = new THREE.Mesh(finGeo, flapInnerMat);
  finOuter.castShadow = true;
  finOuter.receiveShadow = true;
  finInner.receiveShadow = true;
  const edge = new THREE.Mesh(new THREE.BufferGeometry(), outerMat);
  edge.castShadow = true;
  finGroup.add(finOuter, finInner, edge);
  group.add(finGroup);

  // ゴムひも
  const band = new THREE.Mesh(new THREE.BufferGeometry(), bandMat);
  band.castShadow = true;
  group.add(band);

  const state = { fold: 0, pinch: 0, twist: 0, wrinkle: 0.25, band: 0, bandTilt: 0 };
  let lastKey = '';

  function buildFin() {
    const { fold, pinch, wrinkle } = state;
    const pk = clamp(pinch, 0, 1);
    const over = Math.max(0, pinch - 1);
    // m: ドームの形 → トサカの形 への変形度合い
    const f1 = clamp(fold, 0, 1);
    const m = f1 * f1 * (3 - 2 * f1);
    const th = fold * (Math.PI / 2);
    // トサカ状態の曲がり：つまむほどまっすぐ。つまみすぎ・しわで少し曲がる。
    const cFin = (1 - pk) * 0.8 + over * 0.8 + wrinkle * 0.25;
    const H = 0.6 + 0.4 * pk - over * 0.25;
    const ys = lerp(DOME_H, 1, m);
    const edgePts = [];
    for (let i = 0; i <= U_SEG; i++) {
      const u = -1 + (2 * i) / U_SEG;
      const z = u * 0.995;
      const r = Math.sqrt(Math.max(0.0001, 1 - z * z));
      const hy = DOME_H * r;
      const prof = (1 - pk) * r * 0.85 + pk * crest(u);
      const len = lerp((Math.PI / 2) * r, H * prof, m);
      let c = lerp(1 / r, cFin, m);
      if (Math.abs(c) < 1e-4) c = 1e-4;
      for (let j = 0; j <= V_SEG; j++) {
        const s = j / V_SEG;
        const v = s * len;
        const ang = th - c * v;
        let x = (Math.sin(th) - Math.sin(ang)) / c;
        let y = hy + ((Math.cos(ang) - Math.cos(th)) / c) * ys;
        // しわ：面の法線方向に波打たせる
        const wr = wrinkle * 0.08 * s * (0.3 + 0.7 * m) * (Math.sin(u * 13 + s * 5) + 0.5 * Math.sin(u * 29 - s * 9));
        x += -Math.sin(ang) * wr;
        y += Math.cos(ang) * wr;
        // 机や、反対側に倒れたときは残りの半分にめりこまないように
        if (x < 0) y = Math.max(y, domeY(x, z) + 0.012);
        y = Math.max(y, 0.012);
        const k = (i * (V_SEG + 1) + j) * 3;
        finPos[k] = x;
        finPos[k + 1] = y;
        finPos[k + 2] = z;
        if (j === V_SEG) edgePts.push(new THREE.Vector3(x, y, z));
      }
    }
    finGeo.attributes.position.needsUpdate = true;
    finGeo.computeVertexNormals();
    finGeo.computeBoundingSphere();
    edge.geometry.dispose();
    edge.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edgePts), 48, 0.03, 6, false);
    finGroup.rotation.y = state.twist * m;
  }

  function buildBand() {
    const b = clamp(state.band, -0.2, 1.3);
    const hooked = clamp(b, 0, 1);
    const pts = [];
    const N = 40;
    const tilt = state.bandTilt * 0.6;
    const ct = Math.cos(tilt);
    const st = Math.sin(tilt);
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2;
      const front = Math.max(0, Math.sin(a)); // +z が前
      let y = 0.05 + b * 0.55 * front * front;
      let r = Math.sqrt(Math.max(0.04, 1 - Math.pow(y / DOME_H, 2))) + 0.025;
      r += (1 - hooked) * 0.14 * (0.4 + front); // ゆるんでいる間は外にたるむ
      let px = Math.cos(a) * r;
      let pz = Math.sin(a) * r;
      // 左右のかたむき（前後軸まわりに回転）
      const ry = y * ct - px * st;
      px = px * ct + y * st;
      y = Math.max(0.03, ry);
      pts.push(new THREE.Vector3(px, y, pz));
    }
    const curve = new THREE.CatmullRomCurve3(pts, true);
    band.geometry.dispose();
    band.geometry = new THREE.TubeGeometry(curve, 96, 0.028, 6, true);
  }

  function update(force = false) {
    const key = [state.fold, state.pinch, state.twist, state.wrinkle, state.band, state.bandTilt]
      .map((v) => v.toFixed(3)).join(',');
    if (!force && key === lastKey) return;
    lastKey = key;
    buildFin();
    buildBand();
  }

  function reset(s) {
    Object.assign(state, s);
    update(true);
  }

  update(true);
  return { group, state, update, reset };
}
