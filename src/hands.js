import * as THREE from 'three';

// プレイヤーの手。side = -1（左手）/ +1（右手）
// モデルは「指が +y、手のひらが +z」でつくり、外側のグループで向きを変える。
export function createHand(side) {
  const group = new THREE.Group();   // 位置
  const pivot = new THREE.Group();   // 向き
  const model = new THREE.Group();   // 左右反転
  group.add(pivot);
  pivot.add(model);
  if (side < 0) model.scale.x = -1;

  const skin = new THREE.MeshStandardMaterial({ color: 0xffd2b0, roughness: 0.7 });
  const sleeve = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x1f3f9a, roughness: 0.8 });

  const mesh = (geo, m, parent = model) => {
    const o = new THREE.Mesh(geo, m);
    o.castShadow = true;
    parent.add(o);
    return o;
  };

  const palm = mesh(new THREE.SphereGeometry(0.3, 24, 16), skin);
  palm.scale.set(1, 1.1, 0.42);

  const fingers = [];
  const fx = [-0.17, -0.06, 0.06, 0.17];
  const fl = [0.2, 0.26, 0.28, 0.24];
  for (let i = 0; i < 4; i++) {
    const base = new THREE.Group();
    base.position.set(fx[i], 0.27, 0);
    base.rotation.z = (fx[i]) * -0.35;
    model.add(base);
    const f = mesh(new THREE.CapsuleGeometry(0.062, fl[i], 4, 10), skin, base);
    f.position.y = fl[i] / 2 + 0.04;
    fingers.push(base);
  }
  // 親指（右手で +x 側）
  const thumbBase = new THREE.Group();
  thumbBase.position.set(0.24, -0.02, 0.04);
  thumbBase.rotation.z = -0.9;
  model.add(thumbBase);
  const thumb = mesh(new THREE.CapsuleGeometry(0.07, 0.2, 4, 10), skin, thumbBase);
  thumb.position.y = 0.15;

  // 手首〜腕（画面の外へのびる）
  const arm = mesh(new THREE.CylinderGeometry(0.15, 0.19, 1.6, 16), skin);
  arm.position.y = -0.95;
  const sl = mesh(new THREE.CylinderGeometry(0.27, 0.27, 1.2, 16), sleeve);
  sl.position.y = -2.1;
  const tr = mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.08, 16), trim);
  tr.position.y = -1.52;

  let curl = 0;
  function setCurl(t) {
    curl += (t - curl) * 0.3;
    fingers.forEach((f, i) => { f.rotation.x = curl * (0.9 + i * 0.08); });
    thumbBase.rotation.x = curl * 0.5;
  }

  return { group, pivot, setCurl };
}
