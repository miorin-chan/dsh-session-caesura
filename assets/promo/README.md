# 宣传片

一支 30 秒的功能介绍片。它从动机讲起：一轮对话结束后，想把收获记下来，可一发出去就又开了一轮。
片子随后倒回发送之前，演示休止符怎样把同一段草稿存成结语笔记，最后落在休止符图标与「休止符 · Caesura」上。
做法与视觉沿用[下一步建议的宣传片](../../../dsh-next-actions/assets/promo/README.md)：
画面是时间的纯函数，声音与画面共用一份 cue sheet。
本目录不随 npm 发布（`package.json` 的 `files` 不含 `assets/`）；成片是生成物，
不入库（`.gitignore` 忽略 `assets/promo/*.mp4`），按下文「重新生成」渲染。

| 文件 | 内容 |
| --- | --- |
| `dsh-session-caesura-promo.mp4` | 成片（生成物，不入库）：1920×1080，30fps，30 s，H.264 / yuv420p + AAC 48 kHz 立体声 |
| `poster.png` | 封面帧（t = 9.5 s，按住 ⌘，发送键变成休止符） |
| `promo.html` | 动画源文件：画面是时间 `t` 的纯函数；`<script id="timeline">` 是共用的 cue sheet |
| `soundtrack.mts` | 读同一份 cue sheet，合成配乐与界面音效 |
| `render-video.sh` | 逐帧注入时间、并行截图、合成音轨、用 ffmpeg 编码；也可只替换音轨 |
| `render-html.sh` | 单帧截图：Chrome headless，DSF 2，一次性临时 profile |

## 分镜

前两段不编号，交代动机；之后每段一行编号字幕，陈述该段演示的行为。

| 时间 | 字幕 | 画面 |
| --- | --- | --- |
| 0.0–4.0 s | 一轮结束，想把收获记下来 | 窗口浮入，回答流出；用户在输入框写下一句理解笔记 |
| 4.0–6.6 s | 可一发出去，又开了一轮 | 按 Enter，草稿成了新消息；过程行「思考中 → 已完成」，模型接话 |
| 6.6–7.4 s | 倒回发送之前 | 倒带：新的一轮按原路收回，草稿回到输入框 |
| 7.5–10.0 s | 01 按住 ⌘，发送键变成休止符 | 镜头推近输入框；按住 ⌘ 出现休止符，松开恢复箭头，再按住 |
| 10.0–15.0 s | 02 点一下：存为结语笔记 | 点休止符，草稿飞到回答操作栏下方，成为「结语笔记」；标注「只存在当前浏览器」 |
| 15.0–19.5 s | 03 再存一次，接在后面 | 再写一句，输入框非空时回退与发送变灰；⌘ Enter 保存，新段空一行接在后面 |
| 19.5–24.4 s | 04 复制、回退，或者发送 | 悬停发送看到提示；点复制变成勾；点回退，合并后的全文回到输入框 |
| 25.0–30.0 s | — | 片尾：休止符自上而下落墨，下方「休止符 · Caesura」与包名 |

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
- 成对的值是 `[开始, 结束]`；`mod` 列出按住 ⌘ 的区间。
- `noteKeys`、`appendKeys` 逐个列出按键时刻，画面按它们逐字显示，音轨在同一时刻放按键声。
- `rewind` 是倒带区间：发送那一支在 `rewindFrom` 与 `rewindTo` 之间按原路倒放，之后停在发送之前。
- `save1`、`save2` 是两次保存，都落在拍点上。

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
./render-video.sh stills promo.html /tmp/promo-stills 9.5
cp /tmp/promo-stills/t9.5.png poster.png
node soundtrack.mts promo.html /tmp/soundtrack.wav                             # 只试听音轨
```

`render-video.sh` 与 `render-html.sh` 复制自下一步建议的宣传片目录，两处改动需同步。
`render-video.sh` 把 `promo.html` 里的 `window.__T = null; /*FRAME_T*/` 逐帧替换成时间，
交给 `render-html.sh` 截图；`video` 的可选参数是帧率（默认 30），`AUDIO=0` 时输出无声视频。
逐帧页面、PNG 和音轨放在系统临时目录，脚本退出即删。
截图参数与钥匙串注意事项见 `render-html.sh` 头注释。

## 声音

配乐沿用下一步建议宣传片的 lo-fi 乐器与母带处理：电钢琴和弦、摇摆鼓组和圆润低音，F 大调四小节一循环。
动机段只有铺底和电钢琴；倒带时音乐沉下去，换成一段音高下滑、颤动渐慢的倒带声。
按住 ⌘ 时踩镲与轻底鼓进入，第一次保存起完整鼓组与低音，最后一段鼓组退场，落在 25.0 s 的 Fmaj9 上。

两次保存都落在拍点上，音乐在那里休止一拍，只留下点击和草稿飞入结语的声音，呼应插件的名字。
界面音效走单独的总线，不受休止影响；全部是无音高的轻敲、点击、按键和风声。
`soundtrack.mts` 不读取外部素材，同一输入输出按字节一致。

## 字体

界面文字的字体栈与下一步建议的宣传片相同：`system-ui` 开头以落到 SF，等宽字体用 Menlo。
片尾的「休止符」用宋体（Songti SC Light），「Caesura」用 Bodoni 72 斜体：Bodoni 是古典乐谱时代的字体，
斜体又像乐谱上的表情记号，与休止符的意象相合。
