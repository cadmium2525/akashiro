import * as THREE from 'three';

// 結果のシェア。ボタンは1つで、画像と投稿文（タグ・URL入り）をまとめて共有シートに渡す。
// 画像は結果画面が出た時点で先に作っておく。iOS Safari は、タップから時間がたってから
// navigator.share を呼ぶと拒否することがあるため、タップ時は待たずに呼べるようにする。

// 投稿文に入れる、ゲームの公開URL（ローカルで遊んでいても公開版のURLを載せる）
export const PUBLIC_URL = 'https://cadmium2525.github.io/akashiro/';
export const TAGS = ['#ウルトラ赤白帽', '#赤白帽子', '#ウルトラマン'];

const W = 1080;
const H = 1350;
const INK = '#3a2a1a';
const RED = '#d8262c';
const PAPER = '#fffaf0';
const FONT = '"M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", "Hiragino Sans", system-ui, sans-serif';

export function buildText({ lead, rank, name, total, diffName }) {
  return [
    lead,
    `【${rank}】${name}　${total}点（${diffName}）`,
    TAGS.join(' '),
    PUBLIC_URL,
  ].join('\n');
}

function roundRectPath(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

// 幅におさまるように文字サイズを縮めて描く
function fitText(c, text, x, y, maxW, size, weight = 800) {
  let s = size;
  c.font = `${weight} ${s}px ${FONT}`;
  while (c.measureText(text).width > maxW && s > 16) {
    s -= 2;
    c.font = `${weight} ${s}px ${FONT}`;
  }
  c.fillText(text, x, y);
}

export function createShare({ renderer, scene, camera, view }) {
  const size = new THREE.Vector2();
  const state = { promise: null, file: null, text: '' };

  // 3Dシーンを縦長(4:5)で撮る。カメラは次のフレームで毎回セットし直されるので、戻すのは画面サイズだけ。
  function shoot() {
    renderer.getSize(size);
    const prevW = size.x;
    const prevH = size.y;
    const prevPR = renderer.getPixelRatio();
    renderer.setPixelRatio(1);
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.position.copy(view.pos);
    camera.lookAt(view.look);
    const dist = view.pos.distanceTo(view.look);
    const need = THREE.MathUtils.radToDeg(2 * Math.atan(view.halfW / dist / camera.aspect));
    camera.fov = Math.max(view.minFov, need);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);

    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    cv.getContext('2d').drawImage(renderer.domElement, 0, 0);

    renderer.setPixelRatio(prevPR);
    renderer.setSize(prevW, prevH, false);
    camera.aspect = prevW / prevH;
    camera.updateProjectionMatrix();
    return cv;
  }

  function decorate(cv, info) {
    const c = cv.getContext('2d');
    c.lineJoin = 'round';
    c.textBaseline = 'alphabetic';

    // タイトル
    c.textAlign = 'left';
    c.font = `800 118px ${FONT}`;
    const a = 'ウルトラ';
    const b = '赤白帽';
    const wa = c.measureText(a).width;
    const wb = c.measureText(b).width;
    const x0 = (W - wa - wb) / 2;
    c.lineWidth = 22;
    c.strokeStyle = INK;
    c.strokeText(a, x0, 150);
    c.strokeText(b, x0 + wa, 150);
    c.fillStyle = RED;
    c.fillText(a, x0, 150);
    c.fillStyle = '#fff';
    c.fillText(b, x0 + wa, 150);

    // 結果のカード
    const px = 50;
    const py = H - 400;
    const pw = W - 100;
    const ph = 350;
    c.save();
    c.shadowColor = 'rgba(58, 42, 26, 0.35)';
    c.shadowOffsetY = 10;
    roundRectPath(c, px, py, pw, ph, 40);
    c.fillStyle = PAPER;
    c.fill();
    c.restore();
    roundRectPath(c, px, py, pw, ph, 40);
    c.lineWidth = 10;
    c.strokeStyle = INK;
    c.stroke();

    // ランク
    c.textAlign = 'center';
    c.font = `800 260px ${FONT}`;
    c.lineWidth = 20;
    c.strokeStyle = INK;
    c.strokeText(info.rank, px + 200, py + 255);
    c.fillStyle = RED;
    c.fillText(info.rank, px + 200, py + 255);

    // ランク名・点数
    const tx = px + 380;
    const tw = pw - 380 - 40;
    c.textAlign = 'left';
    c.fillStyle = INK;
    fitText(c, info.name, tx, py + 105, tw, 62);

    c.font = `800 150px ${FONT}`;
    c.fillText(String(info.total), tx, py + 245);
    const numW = c.measureText(String(info.total)).width;
    c.font = `800 60px ${FONT}`;
    c.fillText('点', tx + numW + 8, py + 245);
    const tenW = c.measureText('点').width;
    c.fillStyle = '#8a6d4d';
    fitText(c, `（${info.diffName}）`, tx + numW + tenW + 24, py + 245, tw - numW - tenW - 24, 46, 500);

    // タグとURL
    c.fillStyle = '#8a6d4d';
    c.textAlign = 'center';
    fitText(c, `${TAGS[0]}　${PUBLIC_URL.replace(/^https?:\/\//, '').replace(/\/$/, '')}`, W / 2, py + 316, pw - 60, 34, 500);
  }

  async function makeFile(info) {
    try {
      await document.fonts.load(`800 60px ${FONT}`, 'ウルトラ赤白帽S点0123456789');
    } catch (_) { /* フォントなしでも作れる */ }
    const cv = shoot();
    decorate(cv, info);
    const blob = await new Promise((resolve) => cv.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('toBlob failed');
    return new File([blob], 'ultra-akashiro.png', { type: 'image/png' });
  }

  // 結果が決まったら呼ぶ。画像と投稿文を先につくっておく。
  function prepare(info) {
    state.file = null;
    state.text = buildText(info);
    state.promise = makeFile(info)
      .then((f) => { state.file = f; })
      .catch((e) => { console.warn('share image failed', e); });
    return state.promise;
  }

  function reset() {
    state.file = null;
    state.promise = null;
    state.text = '';
  }

  function download(file) {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  // 戻り値: 'shared' | 'cancelled' | 'saved'（共有シートが使えず、画像を保存して投稿文をコピーした）
  async function share() {
    if (state.promise && !state.file) await state.promise;
    const { file, text } = state;
    try {
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text });
        return 'shared';
      }
      if (!file && navigator.share) {
        await navigator.share({ text });
        return 'shared';
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
      console.warn('share failed', e);
    }
    // 共有シートがない（PCなど）：画像を保存し、投稿文をコピー
    if (file) download(file);
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) { /* コピーできない環境 */ }
    return 'saved';
  }

  return { prepare, share, reset, get text() { return state.text; }, get file() { return state.file; } };
}
