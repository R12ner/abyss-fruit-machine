/** 全站设置面板。整个页面只建一个，大厅和每台机台都打开同一个。 */
import {settings, COIN_SKINS, MOTION_LEVELS} from './settings.mjs';
import {playSound} from './audio.mjs';

let dialog;

function build() {
  dialog = document.createElement('dialog');
  dialog.className = 'arcade-settings';
  dialog.innerHTML = `<button type="button" class="arcade-settings-close" aria-label="关闭设置">×</button>
    <small>ABYSS ARCADE</small><h2>机台设置</h2>
    <section><h3>硬币样式</h3><p>换掉推币机台面、出币槽和大厅封面上的硬币。</p>
      <div class="settings-skins" role="group" aria-label="硬币样式">${COIN_SKINS.map(skin =>
        `<button type="button" data-skin="${skin.id}" aria-pressed="false">
          <img src="${skin.file}" alt=""><span>${skin.label}</span></button>`).join('')}</div></section>
    <section><h3>音效</h3>
      <label class="settings-switch"><input type="checkbox" data-sound><span class="switch-track" aria-hidden="true"><i></i></span><span>开启机台音效</span></label>
      <label class="settings-volume">音量 <output data-volume-label>70%</output>
        <input type="range" min="0" max="100" step="5" data-volume aria-label="音效音量"></label></section>
    <section><h3>动画强度</h3><p>控制画面震动和中奖特效的幅度。选"关闭"后机台不再晃动。</p>
      <div class="settings-motion" role="group" aria-label="动画强度">${MOTION_LEVELS.map(level =>
        `<button type="button" data-motion="${level.id}" aria-pressed="false">${level.label}</button>`).join('')}</div></section>
    <section><h3>键盘</h3><ul class="settings-keys">
      <li><b>空格 / Enter</b><span>投币、放球</span></li>
      <li><b>← →</b><span>扳动摇柄、摇台</span></li>
      <li><b>Esc</b><span>返回游戏大厅</span></li></ul></section>
    <button type="button" class="arcade-settings-done">完成</button>`;
  document.body.append(dialog);

  const $ = selector => dialog.querySelector(selector);
  const close = () => dialog.close();
  $('.arcade-settings-close').onclick = $('.arcade-settings-done').onclick = close;

  for (const button of dialog.querySelectorAll('[data-skin]')) {
    button.onclick = () => {settings.update({coinSkin: button.dataset.skin}); playSound(720, .06);};
  }
  for (const button of dialog.querySelectorAll('[data-motion]')) {
    button.onclick = () => {settings.update({motion: button.dataset.motion}); playSound(560, .06);};
  }
  $('[data-sound]').onchange = event => {settings.update({sound: event.target.checked}); playSound();};
  $('[data-volume]').oninput = event => {settings.update({volume: Number(event.target.value) / 100});};
  $('[data-volume]').onchange = () => playSound(640, .08);

  settings.subscribe(state => {
    for (const button of dialog.querySelectorAll('[data-skin]')) {
      button.setAttribute('aria-pressed', String(button.dataset.skin === state.coinSkin));
    }
    for (const button of dialog.querySelectorAll('[data-motion]')) {
      button.setAttribute('aria-pressed', String(button.dataset.motion === state.motion));
    }
    $('[data-sound]').checked = state.sound;
    $('[data-volume]').value = String(Math.round(state.volume * 100));
    $('[data-volume-label]').textContent = `${Math.round(state.volume * 100)}%`;
  });
  return dialog;
}

export function openSettings() {
  (dialog || build()).showModal();
}
