# 深渊赌场 · ABYSS ARCADE

模块化的静态街机赌场，目前包含 24 格八门水果机和单零欧式轮盘。使用模拟 USD，不支持充值、提现或兑换。

- 在线游戏：https://abyss-fruit-arcade.omiku-9996.chatgpt.site
- GitHub：https://github.com/R12ner/abyss-fruit-machine

## 工程结构

```text
dist/
├── assets/
│   ├── coins/              # 街机币、BTC、USDT、USDC 独立素材
│   └── fruits/             # 独立水果素材
├── js/
│   ├── bootstrap.mjs        # 组合注册表、赌场大厅与游戏模块
│   ├── casino/
│   │   ├── game-registry.mjs # 游戏注册与 enter/leave 生命周期
│   │   ├── shell.mjs         # 赌场入口、大厅卡片和游戏切换
│   │   └── wallet.mjs        # 跨游戏共享钱包接口
│   ├── core/
│   │   ├── game.mjs          # 水果机纯规则
│   │   └── roulette.mjs      # 轮盘纯规则
│   └── games/
│       ├── fruit/            # 水果机清单、生命周期、UI 与音频
│       └── roulette/         # 轮盘清单、生命周期与交互
├── app.js                   # 兼容启动器
├── index.html
├── style.css                # 水果机样式
└── roulette.css             # 轮盘与赌场大厅样式
tests/                       # 核心规则和资金守恒测试
```

音乐由 `soundtrack.mjs` 中的音符数据驱动，并由 `audio-engine.mjs` 在浏览器内实时合成，因此不依赖隐藏的 MP3 文件。修改编曲、奖项旋律和音频引擎时互不影响。

## 新增游戏模块

新游戏放入独立的 `dist/js/games/<game-id>/` 目录，并导出一份游戏定义：

```js
export const coinPusherGameDefinition = {
  id: 'coin-pusher',
  badge: 'PUSHER 01',
  title: '深渊推币机',
  subtitle: 'COIN PUSHER',
  art: '<span class="coin-pusher-card-art"></span>',
  create({wallet, openLobby}) {
    return {
      enter() {},
      leave() {},
      lobbyActions: []
    };
  }
};
```

然后只需在 `bootstrap.mjs` 导入并调用 `registry.register(...)`。推币机可通过公共 `wallet.balance()`、`wallet.spend(amount)` 和 `wallet.deposit(amount)` 使用同一模拟钱包，不需要依赖水果机或轮盘内部实现。

## 本地运行

```sh
npm run serve
```

打开 http://127.0.0.1:8000 。内置 Node 静态服务器会为 `.mjs` 返回正确的 JavaScript MIME 类型；不要直接双击 `index.html` 打开。

## 验证

```sh
npm test
npm run check
```

## 游戏规则

初始钱包为 100 模拟 USD。玩家把币放入槽内并投入机台后，可对八种水果下注；单门上限 99 USD。主灯共有 24 个等概率落点。

水果下注支持键盘操作：`Q W E R T Y U I` 从左到右依次对应八个水果。短按加注一次，也可以同时长按多个键，让各水果独立连续加注；输入金额、打开弹窗、返回菜单或进入轮盘时，快捷键会自动停用。

设置中可以隐藏水果按钮上的键盘提示，隐藏后快捷键仍然有效。轮盘下注台可手动折叠，筹码落桌会播放碰撞音并按下注次数堆叠显示。轮盘的八个筹码槽默认为空，需在筹码商店按面额逐枚购买；一枚筹码消耗等额的水果机模拟 USD。中奖筹码会在荷官赔付区按同面额、同颜色归堆；可逐枚点击领取，也可长按一枚进入扫取模式，随后滑动触碰到的筹码会连续收入对应口袋。赌场菜单的自助出售柜台支持逐枚或一键出售筹码槽库存。筹码库存、未领取赔付与桌面押注都会在离开轮盘时保存。

给荷官小费有小概率触发下一局内幕彩蛋。触发率随单枚小费面额提升并设有上限；命中彩蛋后，会按不同概率透露下一局的颜色、数字区间、单双、十二数区、列或精确号码。颜色消息大概率为真，其他类型各有独立可信度，假消息会在开奖后由荷官承认。真假概率和全部荷官台词集中在 `dist/js/games/roulette/dealer-dialogue.mjs`，可直接修改。已经获得的内幕会一直保留到下一次实际旋转。

破产保护：水果机全部资产归零后可领取 10 USD；赌场钱包与轮盘内的筹码、下注和待领取赔付全部归零后，可领取一枚 1 USD 轮盘筹码。

特殊事件包括幸运送灯、火车连奖、大三元、小三元和累积彩金。送灯和三元逐灯开奖；火车先确定车头，再让连续 4 盏灯组成整列一起跑动、一起停下。中奖所得先进入 WIN，可转至 CREDIT，也可把 CREDIT 追加到本轮比倍筹码。比倍小为 1–7，大为 8–14，最多连续五次。

游戏状态、彩金池、声音设置和硬币样式均保存在当前浏览器。退币会逐枚落入槽内并保留已有币堆，再次退币从当前币堆继续追加。总资金归零时会显示 10 模拟 USD 补贴；点击领取后立即写入钱包和本地存档，领取前刷新仍会再次显示。

## 推币机与弹珠机

大厅现已接入四台游戏，可通过 `#coin-pusher` 和 `#plinko` 直接进入新机台。两台机台沿用赌场的深绿黄铜风格，并使用共享模拟钱包。

- 推币机：每枚 1 USD，支持台面点击/滑杆瞄准及连续投 5 枚。推板驱动币堆碰撞，正前方每枚落币奖励 1 USD，两侧落币不计奖。
- 弹珠机：10 / 20 / 50 / 100 USD 面额，12 层独立左右随机碰钉、13 个倍率槽。经典档最高 ×10，高倍档最高 ×100；奖励包含本金。
- 两台机台的奖励均暂存出币槽，主动领取后加入钱包。切换机台、切后台会暂停动画；刷新从已保存的投币或落球继续，不重新扣费。
- 在机台内可用空格或 Enter 投一枚/释放一颗弹珠，Esc 返回大厅；输入控件和玩法弹窗内不触发游戏快捷键。

素材分别位于 `dist/assets/coin-pusher/` 和 `dist/assets/plinko/`；独立规则模块和界面分别位于对应 `dist/js/games/` 子目录。`tests/mechanical.test.mjs` 覆盖全部 4096 条落球路径、整额结算、前沿/侧槽判定和推币存档恢复。
