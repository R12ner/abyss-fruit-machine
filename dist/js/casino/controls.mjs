/**
 * 街机实体控制件。
 * 摇柄不是拖动条：按住一侧它就持续往那边扳，松手停在当前角度，
 * 和真机上的方向杆一样，所以位置是"扳到"的而不是"拖到"的。
 */

const clamp01 = value => Math.max(0, Math.min(1, value));

/**
 * @param {object} options
 * @param {string} options.label      无障碍名称
 * @param {number} options.value      初始值 0~1
 * @param {number} [options.speed]    每秒扳动的行程比例
 * @param {(value:number)=>void} options.onChange 扳动过程中持续回调
 */
export function createLever({label, value = .5, onChange}) {
  const root = document.createElement('div');
  root.className = 'arcade-lever';
  root.innerHTML = `<div class="lever-gate" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
    <div class="lever-plate" aria-hidden="true"></div>
    <span class="stick-hint stick-hint-left" aria-hidden="true">◀ 左</span>
    <span class="stick-hint stick-hint-right" aria-hidden="true">右 ▶</span>
    <div class="lever-pivot" aria-hidden="true"></div>
    <div class="lever-arm" aria-hidden="true"><span class="lever-shaft"></span><span class="lever-knob"></span></div>
    <button class="stick-grab" type="button" role="slider" aria-label="${label}"
      aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(value * 100)}"></button>
    <div class="lever-readout" aria-hidden="true"><output></output></div>`;

  const arm = root.querySelector('.lever-arm');
  const grab = root.querySelector('.stick-grab');
  const output = root.querySelector('output');
  let current = clamp01(value), pointer = null, disabled = false, describe = v => `${Math.round(v * 100)}`;

  function paint() {
    arm.style.setProperty('--tilt', `${(current - .5) * 2 * 30}deg`);
    grab.setAttribute('aria-valuenow', String(Math.round(current * 100)));
    grab.setAttribute('aria-valuetext', describe(current));
    output.textContent = describe(current);
  }
  function apply(next) {
    const clamped = clamp01(next);
    if (clamped === current) return;
    current = clamped;
    paint();
    onChange?.(current);
  }
  /** 指针横向位置直接对应杆的角度——抓住它推，不用点按钮。 */
  function track(event) {
    const rect = root.getBoundingClientRect();
    const usable = rect.width - 48;
    apply((event.clientX - rect.left - 24) / usable);
  }

  grab.addEventListener('pointerdown', event => {
    if (disabled) return;
    pointer = event.pointerId;
    grab.setPointerCapture?.(pointer);
    root.classList.add('is-holding');
    track(event);
    event.preventDefault();
  });
  grab.addEventListener('pointermove', event => {
    if (disabled || event.pointerId !== pointer) return;
    track(event);
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    grab.addEventListener(name, () => {pointer = null; root.classList.remove('is-holding');});
  }
  grab.addEventListener('keydown', event => {
    if (disabled || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
    event.preventDefault();
    apply(current + (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? .12 : .04));
  });

  paint();
  return {
    element: root,
    get value() {return current;},
    set(next) {apply(next);},
    /** 让调用方决定读数怎么写（例如"左 40%"）。 */
    format(formatter) {describe = formatter; paint();},
    /** 键盘快捷键复用：推一格。 */
    nudge(direction) {apply(current + direction * .05);},
    disable(state) {
      disabled = !!state;
      if (disabled) {pointer = null; root.classList.remove('is-holding');}
      root.classList.toggle('is-disabled', disabled);
      grab.disabled = disabled;
      grab.setAttribute('aria-disabled', String(disabled));
    },
  };
}

/**
 * 摇台摇杆：和 createLever 同一套造型，但行为是"点动"而不是"定位"。
 * 按住旋钮往左右拖，推过阈值就触发一次动作，松手自动弹回中位——
 * 真机上的摇台杆就是这种带回中弹簧的，所以它不该停在扳过去的角度上。
 *
 * @param {object} options
 * @param {string} options.label                无障碍名称
 * @param {(direction:-1|1)=>boolean} options.onShake 触发回调，返回 false 表示这次没打出去（例如能量不够）
 */
export function createShakeStick({label, onShake}) {
  const root = document.createElement('div');
  root.className = 'arcade-stick';
  root.innerHTML = `<div class="lever-gate" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
    <div class="lever-plate" aria-hidden="true"></div>
    <span class="stick-hint stick-hint-left" aria-hidden="true">◀ 左摇</span>
    <span class="stick-hint stick-hint-right" aria-hidden="true">右摇 ▶</span>
    <div class="lever-pivot" aria-hidden="true"></div>
    <div class="lever-arm" aria-hidden="true"><span class="lever-shaft"></span><span class="lever-knob"></span></div>
    <button class="stick-grab" type="button" role="slider" aria-label="${label}"
      aria-valuemin="-1" aria-valuemax="1" aria-valuenow="0" aria-valuetext="居中"></button>`;

  const arm = root.querySelector('.lever-arm');
  const grab = root.querySelector('.stick-grab');
  let value = 0, fired = false, disabled = false, pointer = null, springTimer = 0;

  function paint() {
    arm.style.setProperty('--tilt', `${value * 30}deg`);
    root.classList.toggle('is-pushed', Math.abs(value) > .55);
    grab.setAttribute('aria-valuenow', value.toFixed(2));
    grab.setAttribute('aria-valuetext', Math.abs(value) < .2 ? '居中' : value < 0 ? '向左' : '向右');
  }
  function apply(next) {
    value = Math.max(-1, Math.min(1, next));
    paint();
    if (!fired && Math.abs(value) > .8 && onShake?.(Math.sign(value)) !== false) fired = true;
  }
  function spring() {
    clearTimeout(springTimer);
    fired = false;
    value = 0;
    root.classList.remove('is-holding');
    paint();
  }

  grab.addEventListener('pointerdown', event => {
    if (disabled) return;
    pointer = event.pointerId;
    grab.setPointerCapture?.(pointer);
    root.classList.add('is-holding');
    event.preventDefault();
  });
  grab.addEventListener('pointermove', event => {
    if (disabled || event.pointerId !== pointer) return;
    const rect = root.getBoundingClientRect();
    apply((event.clientX - rect.left - rect.width / 2) / (rect.width / 2 - 24));
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) grab.addEventListener(name, () => {pointer = null; spring();});
  grab.addEventListener('keydown', event => {
    if (disabled || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
    event.preventDefault();
    apply(event.key === 'ArrowLeft' ? -1 : 1);
    springTimer = setTimeout(spring, 180);
  });
  window.addEventListener('blur', spring);

  paint();
  return {
    element: root,
    /** 供键盘快捷键复用：打一次并演一遍回弹。 */
    pulse(direction) {
      if (disabled) return;
      apply(direction);
      springTimer = setTimeout(spring, 180);
    },
    disable(state) {
      disabled = !!state;
      if (disabled) spring();
      root.classList.toggle('is-disabled', disabled);
      grab.disabled = disabled;
      grab.setAttribute('aria-disabled', String(disabled));
    },
  };
}
