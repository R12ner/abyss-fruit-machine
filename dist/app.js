'use strict';

import('./js/bootstrap.mjs').catch(error=>{
  console.error('Unable to start Abyss Fruit Arcade',error);
  const status=document.getElementById('status');
  if(status)status.textContent='游戏加载失败，请刷新页面重试';
});
