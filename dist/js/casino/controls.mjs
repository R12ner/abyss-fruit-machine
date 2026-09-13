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
export function createLever({label, value = .5, speed = .85, onChange}) {
  const root = document.createElement('div');
  root.className = 'arcade-lever';
  root.innerHTML = `<div class="lever-gate" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
    <div class="lever-pivot" aria-hidden="true"></div>
    <div class="lever-arm" aria-hidden="true"><span class="lever-shaft"></span><span class="lever-knob"></span></div>
    <div class="lever-plate" aria-hidden="true"></div>
    <button class="lever-grip lever-left" style="grid-column:1" type="button" aria-label="${label}：向左扳"></button>
    <button class="lever-grip lever-right" style="grid-column:3" type="button" aria-label="${label}：向右扳"></button>
    <div class="lever-readout" role="slider" tabindex="0" aria-label="${label}"
      aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(value * 100)}"><output></output></div>`;

  const arm = root.querySelector('.lever-arm');
  const readout = root.querySelector('.lever-readout');
  const output = root.querySelector('output');
  let current = clamp01(value), direction = 0, frame = 0, last = 0, disabled = false, describe = v => `${Math.round(v * 100)}`;

  function paint() {
    arm.style.setProperty('--tilt', `${(current - .5) * 2 * 26}deg`);
    readout.setAttribute('aria-valuenow', String(Math.round(current * 100)));
    output.textContent = describe(current);
  }
  function apply(next) {
    const clamped = clamp01(next);
    if (clamped === current) return;
    current = clamped;
    paint();
    onChange?.(current);
  }
  function tick(now) {
    if (!direction) {frame = 0; return;}
    const elapsed = last ? Math.min(.05, (now - last) / 1000) : 0;
    last = now;
    apply(current + direction * speed * elapsed);
    frame = requestAnimationFrame(tick);
  }
  function hold(next) {
    if (disabled || direction === next) return;
    direction = next;
    root.classList.toggle('is-left', next < 0);
    root.classList.toggle('is-right', next > 0);
    last = 0;
    if (!frame) frame = requestAnimationFrame(tick);
  }
  function release() {
    direction = 0;
    root.classList.remove('is-left', 'is-right');
    cancelAnimationFrame(frame);
    frame = 0;
  }

  for (const [selector, dir] of [['.lever-left', -1], ['.lever-right', 1]]) {
    const grip = root.querySelector(selector);
    grip.addEventListener('pointerdown', event => {event.preventDefault(); grip.setPointerCapture?.(event.pointerId); hold(dir);});
    for (const name of ['pointerup', 'pointercancel', 'pointerleave']) grip.addEventListener(name, release);
  }
  readout.addEventListener('keydown', event => {
    const step = event.shiftKey ? .12 : .04;
    if (event.key === 'ArrowLeft') {event.preventDefault(); apply(current - step);}
    if (event.key === 'ArrowRight') {event.preventDefault(); apply(current + step);}
  });
  window.addEventListener('blur', release);

  paint();
  return {
    element: root,
    get value() {return current;},
    set(next) {apply(next);},
    /** 让调用方决定读数怎么写（例如"左 40%"）。 */
    format(formatter) {describe = formatter; paint();},
    hold, release,
    disable(state) {
      disabled = !!state;
      if (disabled) release();
      root.classList.toggle('is-disabled', disabled);
      for (const grip of root.querySelectorAll('.lever-grip')) grip.disabled = disabled;
      readout.setAttribute('aria-disabled', String(disabled));
    },
  };
}
