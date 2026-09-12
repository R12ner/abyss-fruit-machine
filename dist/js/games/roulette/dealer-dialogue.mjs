// 荷官内幕真假概率。颜色提示最可靠，其余类型故意保留不同可信度。
// 修改这里的数值即可调整各类内幕说真话的概率，范围为 0–1。
export const DEALER_INTEL_TRUTH_CHANCES=Object.freeze({
  color:.88,
  range:.68,
  parity:.62,
  dozen:.55,
  column:.48,
  exact:.32
});

// 荷官所有可自定义台词集中在这里；{value}、{total}、{preferred} 会自动替换。
export const DEALER_SAYINGS=Object.freeze({
  welcome:'荷官：请告诉我您的偏好。',
  preferenceMax:'荷官：好的，我会优先使用可兑换的最大面额。',
  preferenceValue:'荷官：好的，赔付时优先给您 {value} 面值的筹码。',
  exchangeMax:'荷官：已将 {total} USD 整理为最大可用面额。',
  exchangePreferred:'荷官：已将 {total} USD 按 {preferred} 面额优先整理。',
  alreadyShared:'荷官压低声音：我已经告诉过你下一局了。',
  secretLead:'荷官环顾四周，示意你靠近一点……',
  tipThanks:'荷官：谢谢您的 {value} USD 小费。',
  falseIntel:Object.freeze([
    '荷官：牢弟，逗逗你的。',
    '荷官：man what can I say'
  ])
});

export function formatDealerSaying(key,values={}){
  const template=DEALER_SAYINGS[key];
  if(typeof template!=='string')return '';
  return template.replace(/\{(\w+)\}/g,(_,name)=>String(values[name]??''));
}

export function dealerLieReveal(index=0){
  const lines=DEALER_SAYINGS.falseIntel;
  return lines[((Number.isInteger(index)?index:0)%lines.length+lines.length)%lines.length];
}
