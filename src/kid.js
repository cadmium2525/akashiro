import * as THREE from 'three';

// 体育着の小学生。腕と脚は「肩/腰からの相対座標」で関節位置を指定し、
// 円柱をその間に張ってポーズをつくる。

const SKIN = 0xffd7b8;
const SHIRT = 0xffffff;
const NAVY = 0x1f3f9a;
const BLACK = 0x231815;

const UP = new THREE.Vector3(0, 1, 0);
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

// rE/rH: 右ひじ/右手（肩からの相対）, lE/lH: 左
// rK/rF: 右ひざ/右足（腰からの相対）, lK/lF: 左
// 「右」は小学生から見た右（画面では左, -x）
export const POSES = {
  idle: {
    body: v3(0, 0, 0), lean: 0, headTilt: 0, headRoll: 0, brow: 0.35, mouth: 'smile',
    rE: v3(-0.12, -0.42, 0.04), rH: v3(-0.15, -0.82, 0.1),
    lE: v3(0.12, -0.42, 0.04), lH: v3(0.15, -0.82, 0.1),
    rK: v3(0, -0.4, 0.03), rF: v3(0, -0.77, 0),
    lK: v3(0, -0.4, 0.03), lF: v3(0, -0.77, 0),
  },
  // 手を前に出して「かぶせて！」
  ready: {
    body: v3(0, 0, 0), lean: 0.05, headTilt: 0.12, headRoll: 0, brow: 0.2, mouth: 'smile',
    rE: v3(-0.1, -0.3, 0.3), rH: v3(-0.05, -0.2, 0.7),
    lE: v3(0.1, -0.3, 0.3), lH: v3(0.05, -0.2, 0.7),
    rK: v3(0, -0.4, 0.03), rF: v3(0, -0.77, 0),
    lK: v3(0, -0.4, 0.03), lF: v3(0, -0.77, 0),
  },
  // S: スペシウム光線（ひざ立ち＋十字）
  specium: {
    body: v3(0, -0.38, 0), lean: 0.05, headTilt: 0, headRoll: 0, brow: 0.6, mouth: 'smile',
    rE: v3(0.06, -0.3, 0.78), rH: v3(0.06, 0.62, 0.86),
    lE: v3(0.04, -0.28, 0.55), lH: v3(-0.92, -0.28, 0.98),
    rK: v3(-0.03, -0.35, 0.38), rF: v3(-0.03, -0.37, -0.36),
    lK: v3(0.06, 0.08, 0.45), lF: v3(0.06, -0.41, 0.45),
  },
  // A: シュワッチ（片手をつき上げてジャンプ）
  shuwatch: {
    body: v3(0, 0, 0), lean: -0.05, headTilt: -0.15, headRoll: 0, brow: 0.5, mouth: 'smile',
    rE: v3(-0.06, 0.45, 0.05), rH: v3(-0.02, 0.95, 0.1),
    lE: v3(0.3, -0.25, -0.05), lH: v3(-0.02, -0.5, 0.22),
    rK: v3(-0.02, -0.28, 0.3), rF: v3(-0.02, -0.6, -0.08),
    lK: v3(0, -0.4, 0.03), lF: v3(0, -0.77, 0),
  },
  // B: えへへ（頭をかく）
  ehehe: {
    body: v3(0, 0, 0), lean: 0, headTilt: 0.05, headRoll: 0.18, brow: -0.1, mouth: 'smile',
    rE: v3(-0.38, 0.22, 0.12), rH: v3(-0.12, 0.85, 0.05),
    lE: v3(0.12, -0.42, 0.04), lH: v3(0.15, -0.82, 0.1),
    rK: v3(0, -0.4, 0.03), rF: v3(0, -0.77, 0),
    lK: v3(0, -0.4, 0.03), lF: v3(0, -0.77, 0),
  },
  // C: しょんぼり
  sad: {
    body: v3(0, -0.06, 0), lean: 0.22, headTilt: 0.4, headRoll: 0, brow: -0.45, mouth: 'sad',
    rE: v3(-0.05, -0.44, 0.1), rH: v3(-0.02, -0.84, 0.2),
    lE: v3(0.05, -0.44, 0.1), lH: v3(0.02, -0.84, 0.2),
    rK: v3(0.03, -0.38, 0.06), rF: v3(0.06, -0.71, 0),
    lK: v3(-0.03, -0.38, 0.06), lF: v3(-0.06, -0.71, 0),
  },
};

function mat(color, rough = 0.85) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough });
}

export function createKid() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const skin = mat(SKIN, 0.7);
  const shirt = mat(SHIRT, 0.9);
  const navy = mat(NAVY, 0.8);
  const black = mat(BLACK, 0.6);
  const pink = new THREE.MeshBasicMaterial({ color: 0xff9a9a, transparent: true, opacity: 0.55 });
  const lip = mat(0xc0303a, 0.6);

  const add = (parent, geo, m, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };

  // 胴体
  add(body, new THREE.CylinderGeometry(0.4, 0.48, 0.86, 24), shirt, 0, 1.36, 0);
  const collar = add(body, new THREE.TorusGeometry(0.25, 0.045, 8, 28), navy, 0, 1.78, 0);
  collar.rotation.x = Math.PI / 2;
  add(body, new THREE.CylinderGeometry(0.49, 0.5, 0.32, 24), navy, 0, 0.92, 0);
  add(body, new THREE.CylinderGeometry(0.14, 0.15, 0.2, 12), skin, 0, 1.86, 0);

  // 頭
  const head = new THREE.Group();
  head.position.set(0, 2.45, 0);
  body.add(head);
  add(head, new THREE.SphereGeometry(0.72, 40, 28), skin);
  const hair = add(head, new THREE.SphereGeometry(0.735, 32, 16, 0, Math.PI * 2, 0, 1.3), black);
  hair.rotation.x = -0.45;
  for (const s of [-1, 1]) {
    const ear = add(head, new THREE.SphereGeometry(0.16, 16, 12), skin, s * 0.7, -0.02, 0);
    ear.scale.set(0.6, 1, 0.8);
    const eye = add(head, new THREE.SphereGeometry(0.06, 12, 10), black, s * 0.22, -0.02, 0.665);
    eye.scale.set(0.9, 1.15, 0.5);
    const cheek = add(head, new THREE.CircleGeometry(0.13, 20), pink, s * 0.4, -0.2, 0.0);
    cheek.position.set(s * 0.4, -0.2, Math.sqrt(0.73 * 0.73 - 0.16 - 0.04));
    cheek.lookAt(cheek.position.clone().multiplyScalar(2));
    cheek.castShadow = false;
  }
  add(head, new THREE.SphereGeometry(0.045, 10, 8), mat(0xf4a5a0), 0, -0.12, 0.72);
  const brows = [-1, 1].map((s) => {
    const b = add(head, new THREE.BoxGeometry(0.2, 0.045, 0.03), black, s * 0.23, 0.14, 0.655);
    b.userData.side = s;
    return b;
  });
  const smile = add(head, new THREE.TorusGeometry(0.11, 0.022, 8, 20, Math.PI), lip, 0, -0.24, 0.665);
  smile.rotation.z = Math.PI;
  const sad = add(head, new THREE.TorusGeometry(0.09, 0.022, 8, 20, Math.PI), lip, 0, -0.33, 0.645);
  sad.visible = false;
  const sweat = add(head, new THREE.SphereGeometry(0.07, 12, 10), new THREE.MeshStandardMaterial({
    color: 0x9fd6ff, roughness: 0.2, transparent: true, opacity: 0.85,
  }), 0.62, 0.15, 0.35);
  sweat.scale.set(0.8, 1.3, 0.8);
  sweat.visible = false;

  // 関節の基準点
  const anchors = {
    rS: new THREE.Object3D(), lS: new THREE.Object3D(),
    rHip: new THREE.Object3D(), lHip: new THREE.Object3D(),
  };
  anchors.rS.position.set(-0.47, 1.68, 0);
  anchors.lS.position.set(0.47, 1.68, 0);
  anchors.rHip.position.set(-0.22, 0.85, 0);
  anchors.lHip.position.set(0.22, 0.85, 0);
  Object.values(anchors).forEach((a) => body.add(a));

  // 手足のパーツ
  const cyl = (r, m) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 14), m);
    mesh.castShadow = true;
    root.add(mesh);
    return mesh;
  };
  const ball = (r, m) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), m);
    mesh.castShadow = true;
    root.add(mesh);
    return mesh;
  };
  const limbs = {};
  for (const s of ['r', 'l']) {
    limbs[s + 'arm'] = {
      shoulder: ball(0.17, shirt), sleeve: cyl(0.155, shirt), trim: cyl(0.16, navy),
      upper: cyl(0.1, skin), elbow: ball(0.1, skin), fore: cyl(0.095, skin), hand: ball(0.14, skin),
    };
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.36), navy);
    shoe.castShadow = true;
    root.add(shoe);
    limbs[s + 'leg'] = {
      shorts: cyl(0.2, navy), thigh: cyl(0.13, skin), knee: ball(0.13, skin),
      shin: cyl(0.12, skin), sock: cyl(0.125, shirt), shoe,
    };
  }

  const tmp = new THREE.Vector3();
  function placeSeg(m, a, b, from = 0, to = 1) {
    const pa = tmp.copy(a).lerp(b, from).clone();
    const pb = a.clone().lerp(b, to);
    const d = pb.sub(pa);
    const len = Math.max(0.001, d.length());
    m.position.copy(pa).addScaledVector(d, 0.5);
    m.scale.set(1, len, 1);
    m.quaternion.setFromUnitVectors(UP, d.normalize());
  }

  // 現在のポーズ（なめらかに目標へ近づける）
  const cur = clonePose(POSES.idle);
  let target = POSES.idle;
  let targetName = 'idle';
  const points = {};

  function clonePose(p) {
    const o = {};
    for (const k in p) o[k] = p[k] instanceof THREE.Vector3 ? p[k].clone() : p[k];
    return o;
  }

  function setPose(name, instant = false) {
    target = POSES[name];
    targetName = name;
    if (instant) Object.assign(cur, clonePose(target));
    smile.visible = target.mouth === 'smile';
    sad.visible = target.mouth === 'sad';
    sweat.visible = name === 'sad';
  }

  const extra = { bob: 0 };

  function update(dt, t) {
    const k = 1 - Math.exp(-dt * 9);
    for (const key in target) {
      const v = target[key];
      if (v instanceof THREE.Vector3) cur[key].lerp(v, k);
      else if (typeof v === 'number') cur[key] += (v - cur[key]) * k;
    }

    // ポーズごとの小さな動き
    let bob = 0;
    let shake = 0;
    if (targetName === 'shuwatch') bob = Math.max(0, Math.sin(t * 6)) * 0.35;
    if (targetName === 'specium') shake = Math.sin(t * 40) * 0.008;
    if (targetName === 'ehehe') cur.headRoll = 0.18 + Math.sin(t * 5) * 0.06;
    if (targetName === 'idle' || targetName === 'ready') bob = Math.abs(Math.sin(t * 2.2)) * 0.03;
    extra.bob = bob;

    body.position.copy(cur.body);
    body.position.y += bob;
    body.position.x += shake;
    body.rotation.x = cur.lean;
    head.rotation.x = cur.headTilt;
    head.rotation.z = cur.headRoll;
    brows.forEach((b) => { b.rotation.z = -b.userData.side * cur.brow; });
    if (sweat.visible) sweat.position.y = 0.15 - ((t * 0.4) % 1) * 0.3;

    root.updateMatrixWorld(true);
    const local = (o) => root.worldToLocal(o.getWorldPosition(new THREE.Vector3()));
    for (const s of ['r', 'l']) {
      const S = local(anchors[s + 'S']);
      const E = S.clone().add(cur[s + 'E']);
      const Hd = S.clone().add(cur[s + 'H']);
      const arm = limbs[s + 'arm'];
      arm.shoulder.position.copy(S);
      placeSeg(arm.sleeve, S, E, 0, 0.38);
      placeSeg(arm.trim, S, E, 0.36, 0.42);
      placeSeg(arm.upper, S, E, 0.3, 1);
      arm.elbow.position.copy(E);
      placeSeg(arm.fore, E, Hd);
      arm.hand.position.copy(Hd);

      const Hp = local(anchors[s + 'Hip']);
      const K = Hp.clone().add(cur[s + 'K']).sub(new THREE.Vector3(0, bob * 0.5, 0));
      const F = Hp.clone().add(cur[s + 'F']).sub(new THREE.Vector3(0, bob, 0));
      F.y = Math.max(F.y, 0.07);
      K.y = Math.max(K.y, 0.1);
      const leg = limbs[s + 'leg'];
      placeSeg(leg.shorts, Hp, K, 0, 0.32);
      placeSeg(leg.thigh, Hp, K, 0.25, 1);
      leg.knee.position.copy(K);
      placeSeg(leg.shin, K, F, 0, 0.8);
      placeSeg(leg.sock, K, F, 0.72, 1);
      leg.shoe.position.set(F.x, F.y - 0.0, F.z + 0.08);
      points[s + 'E'] = E;
      points[s + 'H'] = Hd;
    }
  }

  setPose('idle', true);
  update(0, 0);
  return { root, head, setPose, update, points, get pose() { return targetName; } };
}
