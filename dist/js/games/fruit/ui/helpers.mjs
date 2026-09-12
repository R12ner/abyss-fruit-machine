export const $=id=>document.getElementById(id);

const FRUIT_ASSETS=['bar','seven','star','watermelon','bell','papaya','orange','apple'];
export const sprite=index=>`<span aria-hidden="true" class="sprite sprite-${FRUIT_ASSETS[index]}" style="background-image:url('assets/fruits/${FRUIT_ASSETS[index]}.png');--delay:-${index*.3}s"></span>`;

const SEGMENTS=['abcdef','bc','abdeg','abcdg','bcfg','acdfg','acdefg','abc','abcdefg','abcdfg'];
export function setLed(id,value,digits=6){
  const node=$(id),text=String(value).padStart(digits,'0');
  node.setAttribute('aria-label',String(value));
  node.innerHTML=[...text].map(char=>`<span class="led-digit" aria-hidden="true">${[...'abcdefg'].map(segment=>`<i class="seg seg-${segment}${(SEGMENTS[Number(char)]||'').includes(segment)?' on':''}"></i>`).join('')}</span>`).join('');
}

export function bindAcceleratingHold(button,action,{bulk=false}={}){
  let hold=null;
  function stop(pointerId){
    if(!hold||(pointerId!==undefined&&hold.pointerId!==pointerId))return;
    clearTimeout(hold.timer);hold=null;
  }
  function repeat(){
    if(!hold||button.disabled){stop();return}
    const elapsed=performance.now()-hold.started;
    const amount=bulk?(elapsed<800?1:elapsed<1500?5:elapsed<2300?25:elapsed<3100?100:elapsed<3900?500:elapsed<4700?2000:5000):1;
    if(action(hold.event,amount,elapsed)===false||!hold){stop();return}
    hold.timer=setTimeout(repeat,Math.max(38,170-elapsed/13));
  }
  button.addEventListener('pointerdown',event=>{
    if(event.button!==0||button.disabled)return;
    event.preventDefault();button.setPointerCapture(event.pointerId);
    hold={pointerId:event.pointerId,started:performance.now(),event,timer:0};
    if(action(event,1,0)===false||!hold){stop();return}
    hold.timer=setTimeout(repeat,420);
  });
  button.addEventListener('pointerup',event=>stop(event.pointerId));
  button.addEventListener('pointercancel',event=>stop(event.pointerId));
  button.addEventListener('lostpointercapture',()=>stop());
  button.addEventListener('click',event=>{event.preventDefault();if(event.detail===0&&!button.disabled)action(event,1,0)});
}

export function ringPositions(){
  const positions=[];
  for(let x=1;x<=9;x++)positions.push([x,1]);
  for(let y=2;y<=5;y++)positions.push([9,y]);
  for(let x=8;x>=1;x--)positions.push([x,5]);
  for(let y=4;y>=2;y--)positions.push([1,y]);
  return positions;
}
