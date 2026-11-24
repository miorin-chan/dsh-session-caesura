# 宣传片

一支 32.5 秒的功能介绍片。休止符图标先落墨亮相，随后从动机讲起：一轮对话结束后，想把收获记下来，可一发出去就又开了一轮。
片子倒回发送之前，演示休止符怎样把同一段草稿存成结语笔记，最后落在休止符图标、
「休止符 · Caesura」和「DeepSeek Harness 插件」上。
画面做法沿用[下一步建议的宣传片](../../../dsh-next-actions/assets/promo/README.md)：
画面是时间的纯函数，声音与画面共用一份 cue sheet。
界面用 DSH 的暗色主题，配乐是小型管弦乐。
本目录不随 npm 发布（`package.json` 的 `files` 不含 `assets/`）；成片是生成物，
不入库（`.gitignore` 忽略 `assets/promo/*.mp4`），按下文「重新生成」渲染。

| 文件 | 内容 |
| --- | --- |
| `dsh-session-caesura-promo.mp4` | 成片（生成物，不入库）：1920×1080，30fps，32.5 s，H.264 / yuv420p + AAC 48 kHz 立体声 |
| `poster.png` | 封面帧（t = 12.0 s，按住 ⌘，发送键变成休止符） |
| `promo.html` | 动画源文件：画面是时间 `t` 的纯函数；`<script id="timeline">` 是共用的 cue sheet |
| `soundtrack.mts` | 读同一份 cue sheet，合成配乐与界面音效 |
| `render-video.sh` | 逐帧注入时间、并行截图、合成音轨、用 ffmpeg 编码；也可只替换音轨 |
| `render-html.sh` | 单帧截图：Chrome headless，DSF 2，一次性临时 profile |

## 分镜

开头是不带文字的标志；动机两段不编号；之后每段一行编号字幕，陈述该段演示的行为。

| 时间 | 字幕 | 画面 |
| --- | --- | --- |
| 0.0–2.5 s | — | 标志：休止符自上而下落墨，停留片刻后虚化退场 |
| 2.5–6.5 s | 一轮结束，想把收获记下来 | 窗口浮入，回答流出；用户在输入框写下一句理解笔记 |
| 6.5–9.1 s | 可一发出去，又开了一轮 | 按 Enter，草稿成了新消息；过程行「思考中 → 已完成」，模型接话 |
| 9.1–9.9 s | 倒回发送之前 | 倒带：新的一轮按原路收回，草稿回到输入框 |
| 10.0–12.5 s | 01 按住 ⌘，发送键变成休止符 | 镜头推近输入框；按住 ⌘ 出现休止符，松开恢复箭头，再按住 |
| 12.5–17.5 s | 02 点一下：存为结语笔记 | 点休止符，草稿飞到回答操作栏下方，成为「结语笔记」，操作行前显示保存时间；标注「只保存在当前客户端」 |
| 17.5–22.0 s | 03 有了结语，按 Enter 就是追加 | 休止符常驻发送键（输入框为空时变灰），标注「已有结语：休止符常驻，Enter 即追加」；再写一句，输入框非空时回退与发送变灰；按 Enter 追加，新段空一行接上，保存时间从 14:33 更新为 14:35 |
| 22.0–26.9 s | 04 复制、回退，或者发送 | 悬停发送看到提示；点复制变成勾；点回退，合并后的全文回到输入框，休止符让回原生发送键 |
| 27.5–32.5 s | — | 片尾：休止符落墨，下方依次是「休止符 · Caesura」「DeepSeek Harness 插件」与包名 |

片中行为与插件实现一致（`ba689a3`）：第一条结语要按住 Mod 才在发送键位置显示休止符；会话有结语后休止符常驻，
输入框为空时不可用，点它或按 Enter 把草稿追加到同一条结语（`SaveButton` 的 `showRest`）。
追加时两段之间恰好空一行并更新保存时间，输入框非空时回退与发送不可用，复制成功后勾号保持 1.2 s（`useNoteCopy`）。
结语沿用 DSH 原生的用户气泡与消息操作行，保存时间在操作行开头（`NoteCard`、`NoteTime`）。
复制、勾、发送、分支、加号、折叠箭头和发送键的图标取自 `@deepseek-ai/dsh-client-ui-primitives`
0.2.2-rc.5 的 `src/icons/artwork.ts` 与 `dsh-client-ui-conversation` 的 `InputBar.tsx`，
操作行尺寸取自 `MessageIconActions.module.css`。
结语存在 Web 客户端的 `localStorage` 与 IndexedDB 里，Desktop 上即应用自带的网页存储，所以标注写「当前客户端」。
DSH 自身的界面元素取自 DSH 0.2.2 暗色主题的 token 与组件样式。
改动脚本里的交互前，先用这些函数核对行为。

## Cue sheet

`promo.html` 里的 `<script id="timeline">` 是画面与声音共用的唯一时间表，所有时间都是成片绝对时间（秒）：

- `duration`：成片总长，`render-video.sh` 按它决定帧数和音轨长度。
- `bpm`：配乐速度；96 BPM 下一小节 2.5 s，主要段落起点落在小节线上。
- 成对的值是 `[开始, 结束]`；`mod` 列出按住 ⌘ 的区间；`restCall` 是常驻休止符的标注，`appendEnter` 是 Enter 键帽；
  `logo` 是 `[落墨开始, 落墨结束, 退场开始, 退场结束]`。
- `noteKeys`、`appendKeys` 逐个列出按键时刻，画面按它们逐字显示，音轨在同一时刻放按键声。
- `rewind` 是倒带区间：发送那一支在 `rewindFrom` 与 `rewindTo` 之间按原路倒放，之后停在发送之前。
- `save1`（点休止符）与 `save2`（按 Enter 追加）都落在拍点上，也是配乐里两处 caesura 的位置。

改动某个时间点后重新渲染，画面与音效一起跟随。

## 预览

浏览器直接打开 `promo.html` 即循环播放（无声）：空格暂停，←/→ 跳 0.5 s。
URL 加 `?t=12` 显示该时刻的静帧。

## 重新生成

需要 macOS 上的 Google Chrome、ffmpeg 和 Node.js。

```sh
cd assets/promo
JOBS=10 ./render-video.sh video promo.html dsh-session-caesura-promo.mp4       # 全部重渲染
./render-video.sh soundtrack promo.html dsh-session-caesura-promo.mp4          # 只换音轨，几秒钟
./render-video.sh stills promo.html /tmp/promo-stills 12
cp /tmp/promo-stills/t12.png poster.png
node soundtrack.mts promo.html /tmp/soundtrack.wav                             # 只试听音轨
```

`render-video.sh` 与 `render-html.sh` 复制自下一步建议的宣传片目录，两处改动需同步。
`render-video.sh` 把 `promo.html` 里的 `window.__T = null; /*FRAME_T*/` 逐帧替换成时间，
交给 `render-html.sh` 截图；`video` 的可选参数是帧率（默认 30），`AUDIO=0` 时输出无声视频。
逐帧页面、PNG 和音轨放在系统临时目录，脚本退出即删。
截图参数与钥匙串注意事项见 `render-html.sh` 头注释。

## 声音

配乐是 F 大调的小型管弦乐，Andante，96 BPM 4/4，一小节 2.5 s，段落起点落在小节线上。
编制是弦乐五部、圆号、单簧管、长笛、竖琴、低音拨弦和定音鼓。
标志段是一串随落墨升起的竖琴琶音，低音弦乐与远处的圆号托底；动机段由单簧管独唱，竖琴弹分解和弦。
按住 ⌘ 时弦乐接过旋律；第一次保存后长笛接上，第二次保存后全奏，以定音鼓和竖琴刮奏开场，
经终止四六和弦与属七和弦落在 27.5 s 的主和弦上，与片尾休止符落墨同时；名字出现时竖琴回应开头的琶音。

休止的用法取自乐谱上的 caesura（//）：全团停在属七和弦的延长记号上，定音鼓滚奏渐强，
保存的一刻戛然而止，寂静持续一拍，只剩厅堂余响，然后下一句从主和弦重新开始。
第一次保存后的乐句从第二拍进入，正好接上结语落定；第二次保存后的全奏落在下一小节的强拍上。
倒带时，刚才奏过的发送那一段被倒着快放回去，带速先快后慢，音高随之升降，下面垫一层轻微的倒带噪声。

上一版的钢琴听感偏尖，这一版只用温暖的音色：弦乐是失谐的限带锯齿波合奏，每位演奏者有自己的延迟颤音，低通随力度打开；
圆号是更暗的锯齿波；单簧管是限带方波；长笛接近纯音，带一点气声；竖琴与拨弦用 Karplus–Strong；定音鼓是非谐模态加毡槌声。
旋律音区压在 F5 以下，混响偏暗，母带再过一道 8 kHz 低通。
界面音效走单独的总线，不受休止影响；全部是无音高的轻敲、点击、按键和风声。
`soundtrack.mts` 不读取外部素材，同一输入输出按字节一致。

## 字体

界面文字的字体栈与下一步建议的宣传片相同：`system-ui` 开头以落到 SF，等宽字体用 Menlo。
片尾的「休止符」用宋体（Songti SC Light），「Caesura」用 Bodoni 72 斜体：Bodoni 是古典乐谱时代的字体，
斜体又像乐谱上的表情记号，与休止符的意象相合。
