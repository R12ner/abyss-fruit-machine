/**
 * 机台画面的共用绘制原语：透视投影、硬币、绿绒台面、金色包边与玻璃反光。
 * 这里只负责"怎么画"，不含任何玩法规则。
 */

/* ---------- 透视 ---------- */

/**
 * 单点透视：越靠近画面下方（离玩家越近）横向越宽，模拟俯视机台内部的纵深。
 * 物理模型始终用未投影的坐标，投影只发生在绘制时。
 */
export function createPerspective({centerX = 360, farY, nearY, farScale = .74}) {
  const span = nearY - farY;
  const scale = y => farScale + (1 - farScale) * Math.max(0, Math.min(1, (y - farY) / span));
  return {
    scale,
    /** 模型 x 在深度 y 处的屏幕 x。 */
    at: (x, y) => centerX + (x - centerX) * scale(y),
    /** 屏幕 x 反推模型 x，用于把点击位置换算成投币位置。 */
    unproject: (screenX, y) => centerX + (screenX - centerX) / scale(y),
    /** 由左右边界和上下深度围成的梯形路径。 */
    trapezoid(ctx, left, right, top, bottom) {
      ctx.beginPath();
      ctx.moveTo(this.at(left, top), top);
      ctx.lineTo(this.at(right, top), top);
      ctx.lineTo(this.at(right, bottom), bottom);
      ctx.lineTo(this.at(left, bottom), bottom);
      ctx.closePath();
    },
  };
}

/* ---------- 硬币 ---------- */

export const COIN_KINDS = Object.freeze({
  normal: Object.freeze({value: 1, label: '', inner: '#ffe9a0', mid: '#c5a54a', outer: '#755020', rim: '#6b4a1c', glow: null}),
  gold:   Object.freeze({value: 3, label: '3', inner: '#fff6cf', mid: '#f0c14b', outer: '#8a5c15', rim: '#7d5210', glow: '#ffd977'}),
  token:  Object.freeze({value: 0, label: '✦', inner: '#d9f7ff', mid: '#4ec9c4', outer: '#134a63', rim: '#0e3b50', glow: '#7fe9ff'}),
});

/**
 * 立体硬币：先落地投影，再画出侧面厚度，最后盖上正面。
 * 侧面让密集的币堆有真正的体积感，而不是一层贴纸。
 */
export function drawCoin(ctx, x, y, radius = 13, image, alpha = 1, kind = 'normal', thickness = radius * .42) {
  const skin = COIN_KINDS[kind] || COIN_KINDS.normal;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#00000055';
  ctx.beginPath(); ctx.ellipse(x + radius * .16, y + thickness + radius * .3, radius * 1.02, radius * .42, 0, 0, Math.PI * 2); ctx.fill();
  if (thickness > .6) {
    const side = ctx.createLinearGradient(x - radius, 0, x + radius, 0);
    side.addColorStop(0, '#00000099'); side.addColorStop(.35, skin.rim); side.addColorStop(.72, skin.outer); side.addColorStop(1, '#00000099');
    ctx.fillStyle = side;
    ctx.beginPath();
    ctx.arc(x, y + thickness, radius, 0, Math.PI);
    ctx.arc(x, y, radius, Math.PI, 0, true);
    ctx.closePath();
    ctx.fill();
  }
  if (skin.glow) {ctx.shadowColor = skin.glow; ctx.shadowBlur = radius * 1.15;}
  const face = ctx.createRadialGradient(x - radius * .3, y - radius * .4, 0, x, y, radius);
  face.addColorStop(0, skin.inner); face.addColorStop(.7, skin.mid); face.addColorStop(1, skin.outer);
  ctx.fillStyle = face;
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  if (kind === 'normal' && image?.complete && image.naturalWidth) {
    ctx.drawImage(image, x - radius, y - radius, radius * 2, radius * 2);
  } else {
    ctx.strokeStyle = skin.inner; ctx.lineWidth = Math.max(.8, radius * .09);
    ctx.beginPath(); ctx.arc(x, y, radius * .76, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = skin.outer; ctx.font = `bold ${radius}px Georgia, serif`; ctx.textAlign = 'center';
    ctx.fillText(skin.label || '$', x, y + radius * .35);
  }
  ctx.restore();
}

/* ---------- 台面与机壳 ---------- */

/** 深绿绒底，带细密织纹，作为整块画布的背景。 */
export function drawFelt(ctx, width = 720, height = 600) {
  ctx.clearRect(0, 0, width, height);
  const gradient = ctx.createRadialGradient(width / 2, height * .4, 10, width / 2, height * .45, width * .58);
  gradient.addColorStop(0, '#174a36'); gradient.addColorStop(1, '#061a12');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#ffffff05';
  for (let y = 0; y < height; y += 5) for (let x = y % 10; x < width; x += 9) ctx.fillRect(x, y, 1, 1);
}

/** 沿当前路径描一圈金色双线包边，是轮盘桌同款的收边方式。 */
export function strokeGoldBezel(ctx, {outer = '#e3c478', inner = '#8a6c32', width = 4} = {}) {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#0a0d08'; ctx.lineWidth = width + 5; ctx.stroke();
  ctx.strokeStyle = inner; ctx.lineWidth = width + 2; ctx.stroke();
  ctx.strokeStyle = outer; ctx.lineWidth = width; ctx.stroke();
  ctx.restore();
}

/** 玻璃罩：斜向高光加四周暗角，让画面像是隔着一层机柜玻璃。 */
export function drawGlass(ctx, width = 720, height = 600) {
  ctx.save();
  const sheen = ctx.createLinearGradient(0, 0, width * .75, height);
  sheen.addColorStop(0, '#ffffff14'); sheen.addColorStop(.28, '#ffffff05');
  sheen.addColorStop(.42, '#ffffff00'); sheen.addColorStop(1, '#ffffff00');
  ctx.fillStyle = sheen; ctx.fillRect(0, 0, width, height);
  const vignette = ctx.createRadialGradient(width / 2, height * .45, width * .28, width / 2, height * .45, width * .72);
  vignette.addColorStop(0, '#00000000'); vignette.addColorStop(1, '#000000a0');
  ctx.fillStyle = vignette; ctx.fillRect(0, 0, width, height);
  ctx.restore();
}
