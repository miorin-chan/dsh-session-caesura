# 宣传片

一支 32.5 秒的功能介绍片。休止符图标先落墨亮相，随后从动机讲起：一轮对话结束后，想把收获记下来，可一发出去就又开了一轮。
片子倒回发送之前，演示休止符怎样把同一段草稿存成结语笔记，最后落在休止符图标、
「休止符 · Caesura」和「DeepSeek Harness 插件」上。
画面做法沿用[下一步建议的宣传片](../../../dsh-next-actions/assets/promo/README.md)：
画面是时间的纯函数，声音与画面共用一份 cue sheet；配乐换成了古典室内乐。
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
| 12.5–17.5 s | 02 点一下：存为结语笔记 | 点休止符，草稿飞到回答操作栏下方，成为「结语笔记」；标注「只存在当前浏览器」 |
| 17.5–22.0 s | 03 再存一次，接在后面 | 再写一句，输入框非空时回退与发送变灰；⌘ Enter 保存，新段空一行接在后面 |
| 22.0–26.9 s | 04 复制、回退，或者发送 | 悬停发送看到提示；点复制变成勾；点回退，合并后的全文回到输入框 |
| 27.5–32.5 s | — | 片尾：休止符落墨，下方依次是「休止符 · Caesura」「DeepSeek Harness 插件」与包名 |

片中行为与插件实现一致：休止符只在按住 Mod 且草稿可保存时盖住发送键（`SaveButton`），
保存不发起新一轮，追加时两段之间恰好空一行（`createNoteStore().append`），
输入框非空时回退与发送不可用（`canSendNote`），复制成功后勾号保持 1.2 s（`useNoteCopy`）。
结语的标题、气泡、操作图标和休止符按钮的尺寸与配色沿用 `src/client/appearance.tsx`；
DSH 自身的界面元素取自 DSH 0.2.2 的主题 token 与组件样式。
改动脚本里的交互前，先用这些函数核对行为。

## Cue sheet

`promo.html` 里的 `<script id="timeline">` 是画面与声音共用的唯一时间表，所有时间都是成片绝对时间（秒）：

- `duration`：成片总长，`render-video.sh` 按它决定帧数和音轨长度。
- `bpm`：配乐速度；96 BPM 下一小节 2.5 s，主要段落起点落在小节线上。
- 成对的值是 `[开始, 结束]`；`mod` 列出按住 ⌘ 的区间；`logo` 是 `[落墨开始, 落墨结束, 退场开始, 退场结束]`。
- `noteKeys`、`appendKeys` 逐个列出按键时刻，画面按它们逐字显示，音轨在同一时刻放按键声。
- `rewind` 是倒带区间：发送那一支在 `rewindFrom` 与 `rewindTo` 之间按原路倒放，之后停在发送之前。
- `save1`、`save2` 是两次保存，都落在拍点上，也是配乐里两处 caesura 的位置。

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

配乐是 F 大调的古典室内乐，Andante，96 BPM 4/4，一小节 2.5 s，段落起点落在小节线上。
钢琴唱旋律、左手弹 Alberti 低音，弦乐组铺和声，拨弦走低音线。
标志段只有一串钢琴琶音和轻铺的弦乐；动机段是钢琴独奏；按住 ⌘ 时弦乐进入；第二次保存之后全奏，
经终止四六和弦与属七和弦落在 27.5 s 的主和弦上，与片尾休止符落墨同时。
名字出现时，钢琴在高音区轻拨一串琶音。

休止的用法取自乐谱上的 caesura（//）：乐句停在属七和弦的延长记号上，按住 ⌘ 时音乐悬在那里，
保存的一刻延长音被干净地切断，寂静持续一拍，只剩厅堂余响，然后下一句从主和弦重新开始。
第一次保存后的乐句从第二拍进入，正好接上结语落定；第二次保存后的全奏落在下一小节的强拍上。
倒带时，刚才奏过的发送那一段被倒着快放回去，带速先快后慢，音高随之升降，下面垫一层轻微的倒带噪声。

钢琴用加性合成：分音按弦的非谐性展开，各自分两段衰减，低音区用两根略微失谐的弦，另加一小段击弦噪声。
弦乐是三把失谐的限带锯齿波，带延迟颤音；拨弦用 Karplus–Strong。
混响是加长了的 Freeverb，模拟小厅。
界面音效走单独的总线，不受休止影响；全部是无音高的轻敲、点击、按键和风声。
`soundtrack.mts` 不读取外部素材，同一输入输出按字节一致。

## 字体

界面文字的字体栈与下一步建议的宣传片相同：`system-ui` 开头以落到 SF，等宽字体用 Menlo。
片尾的「休止符」用宋体（Songti SC Light），「Caesura」用 Bodoni 72 斜体：Bodoni 是古典乐谱时代的字体，
斜体又像乐谱上的表情记号，与休止符的意象相合。
