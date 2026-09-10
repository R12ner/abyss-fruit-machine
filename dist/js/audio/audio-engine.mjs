import {MARIMBA_MOTIFS,MARIMBA_SECTIONS,PRIZE_CUES} from './soundtrack.mjs';

const AUDIO_KEY='abyss-fruit-arcade-audio-v1';
const midiFrequency=note=>440*2**((note-69)/12);
const clampVolume=value=>Number.isFinite(value)?Math.max(0,Math.min(1,value)):null;

export function createAudioEngine({settingsButton}){
  const saved=loadSettings();
  let context,sfxGain,musicGain,musicTimer,musicStep=0;
  let musicVolume=clampVolume(saved.music)??.32;
  let sfxVolume=clampVolume(saved.sfx)??.68;
  const coinTimers=new Set();
  const dialog=createSettingsDialog();

  function loadSettings(){
    try{return JSON.parse(localStorage.getItem(AUDIO_KEY)||'null')||{}}catch{return {}}
  }

  function saveSettings(){
    try{localStorage.setItem(AUDIO_KEY,JSON.stringify({music:musicVolume,sfx:sfxVolume}))}catch{}
  }

  function ensureAudio(){
    try{
      context??=new(window.AudioContext||window.webkitAudioContext)();
      if(!sfxGain){
        sfxGain=context.createGain();musicGain=context.createGain();
        sfxGain.connect(context.destination);musicGain.connect(context.destination);
      }
      sfxGain.gain.setTargetAtTime(sfxVolume,context.currentTime,.02);
      musicGain.gain.setTargetAtTime(musicVolume,context.currentTime,.04);
      context.resume();return true;
    }catch{return false}
  }

  function marimbaNote(frequency,when,duration,level,bus=musicGain){
    if(!context||!bus)return;
    const body=context.createOscillator(),spark=context.createOscillator(),gain=context.createGain(),sparkGain=context.createGain();
    body.type='sine';spark.type='sine';body.frequency.setValueAtTime(frequency,when);spark.frequency.setValueAtTime(frequency*3.98,when);
    gain.gain.setValueAtTime(.0001,when);gain.gain.exponentialRampToValueAtTime(level,when+.006);gain.gain.exponentialRampToValueAtTime(.0001,when+duration);
    sparkGain.gain.setValueAtTime(.0001,when);sparkGain.gain.exponentialRampToValueAtTime(level*.26,when+.003);sparkGain.gain.exponentialRampToValueAtTime(.0001,when+Math.min(.16,duration));
    body.connect(gain);spark.connect(sparkGain);gain.connect(bus);sparkGain.connect(bus);
    body.onended=()=>{body.disconnect();spark.disconnect();gain.disconnect();sparkGain.disconnect()};
    body.start(when);spark.start(when);body.stop(when+duration+.02);spark.stop(when+duration+.02);
  }

  function playMusicStep(){
    if(!context||context.state==='suspended'||musicVolume===0)return;
    const sectionIndex=Math.floor(musicStep/32),local=musicStep%32;
    const [motifIndex,transpose,bassNote]=MARIMBA_SECTIONS[sectionIndex],note=MARIMBA_MOTIFS[motifIndex][local],now=context.currentTime+.02;
    if(note!==null)marimbaNote(midiFrequency(note+transpose),now,.42,local%8===0?.042:.029);
    if(local%8===0)marimbaNote(midiFrequency(bassNote),now,.82,.037);
    if(local%16===14)marimbaNote(midiFrequency(note===null?79:note+transpose+12),now,.58,.014);
    musicStep=(musicStep+1)%(MARIMBA_SECTIONS.length*32);
  }

  function startMusic(){
    if(!ensureAudio()||musicVolume===0)return;
    if(!musicTimer){playMusicStep();musicTimer=setInterval(playMusicStep,278)}
  }

  function stopMusic(){
    clearInterval(musicTimer);musicTimer=null;
  }

  function playPrizeCue(kind){
    if(sfxVolume===0||!ensureAudio())return;
    const notes=PRIZE_CUES[kind]||PRIZE_CUES.bar,now=context.currentTime+.04;
    const spacing=kind==='jackpot'?.11:kind==='failure'?.13:.095;
    musicGain.gain.cancelScheduledValues(now);musicGain.gain.setTargetAtTime(musicVolume*.18,now,.035);
    notes.forEach((note,index)=>marimbaNote(midiFrequency(note),now+index*spacing,kind==='failure'?.28:.48,kind==='jackpot'?.105:.082,sfxGain));
    musicGain.gain.setTargetAtTime(musicVolume,now+notes.length*spacing+.28,.2);
  }

  function playCoinSound(direction,count){
    if(sfxVolume===0||!ensureAudio())return;
    const multiple=count>1;
    for(let index=0;index<count;index++){
      const delay=multiple?(direction==='in'?610+index*48:540+index*86):(direction==='in'?640:570);
      const timer=setTimeout(()=>{
        coinTimers.delete(timer);
        if(sfxVolume===0)return;
        const now=context.currentTime;
        const notes=multiple
          ? (direction==='in'?[1120+(index%3)*85,2250+(index%2)*180]:[560+(index%4)*70,1040+(index%3)*110])
          : (direction==='in'?[1780,3260,4180]:[820,1480,2760]);
        notes.forEach((frequency,n)=>{
          const oscillator=context.createOscillator(),gain=context.createGain();
          const duration=multiple?(direction==='in'?.075:.13):(direction==='in'?.12:.2);
          oscillator.type=direction==='in'?'triangle':(multiple?'sine':'triangle');
          oscillator.frequency.setValueAtTime(frequency,now);
          oscillator.frequency.exponentialRampToValueAtTime(frequency*(direction==='in'?.68:.92),now+duration);
          gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime((multiple?.021:.032)/(n+1),now+.003);gain.gain.exponentialRampToValueAtTime(.0001,now+duration);
          oscillator.connect(gain);gain.connect(sfxGain);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect()};
          oscillator.start(now);oscillator.stop(now+duration);
        });
      },delay);
      coinTimers.add(timer);
    }
  }

  function tone(frequency,duration){
    if(sfxVolume===0||!ensureAudio())return;
    const oscillator=context.createOscillator(),gain=context.createGain();oscillator.type='square';oscillator.frequency.value=frequency;
    gain.gain.setValueAtTime(.025,context.currentTime);gain.gain.exponentialRampToValueAtTime(.001,context.currentTime+duration);
    oscillator.connect(gain);gain.connect(sfxGain);oscillator.start();oscillator.stop(context.currentTime+duration);
  }

  function createSettingsDialog(){
    settingsButton.id='settings';settingsButton.classList.replace('sound-button','settings-button');
    settingsButton.removeAttribute('aria-pressed');settingsButton.setAttribute('aria-label','打开声音设置');
    settingsButton.innerHTML='<svg class="engraved-gear" viewBox="0 0 24 24" aria-hidden="true"><path d="M9.3 3.2 10 1h4l.7 2.2 2 .8 2-1 2.8 2.8-1 2 .8 2L23 10v4l-2.2.7-.8 2 1 2-2.8 2.8-2-1-2 .8L14 23h-4l-.7-2.2-2-.8-2 1-2.8-2.8 1-2-.8-2L1 14v-4l2.2-.7.8-2-1-2L5.8 2.5l2 1z"/><circle cx="12" cy="12" r="3.2"/></svg>';
    const node=document.createElement('dialog');node.className='settings-dialog';
    node.innerHTML='<button type="button" class="close settings-close" aria-label="关闭设置">×</button><span class="eyebrow">AUDIO CONSOLE</span><h2>声音设置</h2><div class="audio-setting"><label for="music-volume"><span>背景音乐</span><small>马林巴街机长循环</small></label><input id="music-volume" type="range" min="0" max="100" step="1"><output id="music-volume-value"></output></div><div class="audio-setting"><label for="sfx-volume"><span>游戏音效</span><small>投币、跑灯与奖项旋律</small></label><input id="sfx-volume" type="range" min="0" max="100" step="1"><output id="sfx-volume-value"></output></div><p class="audio-note">音乐会在首次操作后播放；调到 0 即可静音。</p><button type="button" class="confirm settings-confirm">完成</button>';
    document.body.append(node);return node;
  }

  const musicSlider=dialog.querySelector('#music-volume'),sfxSlider=dialog.querySelector('#sfx-volume');
  const musicOutput=dialog.querySelector('#music-volume-value'),sfxOutput=dialog.querySelector('#sfx-volume-value');
  function updateControls(){
    musicSlider.value=String(Math.round(musicVolume*100));sfxSlider.value=String(Math.round(sfxVolume*100));
    musicOutput.textContent=`${Math.round(musicVolume*100)}%`;sfxOutput.textContent=`${Math.round(sfxVolume*100)}%`;
    if(context){musicGain.gain.setTargetAtTime(musicVolume,context.currentTime,.04);sfxGain.gain.setTargetAtTime(sfxVolume,context.currentTime,.02)}
    if(musicVolume>0&&context)startMusic();else if(musicVolume===0)stopMusic();saveSettings();
  }

  musicSlider.oninput=event=>{musicVolume=Number(event.target.value)/100;startMusic();updateControls()};
  sfxSlider.oninput=event=>{sfxVolume=Number(event.target.value)/100;updateControls();if(sfxVolume>0)tone(520,.055)};
  settingsButton.onclick=()=>{startMusic();updateControls();dialog.showModal()};
  dialog.querySelector('.settings-close').onclick=()=>dialog.close();
  dialog.querySelector('.settings-confirm').onclick=()=>dialog.close();
  document.addEventListener('pointerdown',()=>startMusic(),{once:true});
  document.addEventListener('keydown',()=>startMusic(),{once:true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopMusic();else startMusic()});
  updateControls();

  return Object.freeze({playCoinSound,playPrizeCue,startMusic,stopMusic,tone});
}
