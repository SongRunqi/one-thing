# 用 onething 开发 onething:双实例配方

2026-08-11。写给第一次做自举开发的人。配套审计:
`docs/audit/self-hosting-gap-audit-2026-08-11.md`(能力差距与工单)。

一句话:**日常那只 onething 是驾驶舱,`bun run dev:self` 起的那只是验证场。**
两只跑同一份工作树代码,但 store、端口、日志、产物、Chromium profile 全部分家,
谁也不踩谁。

## 拓扑

```
        ┌──────────────────────────────┐            ┌──────────────────────────────┐
        │  A 实例(稳定 / 驾驶舱)      │            │  B 实例(dev-self / 验证场)  │
        │  bun run dev:electron        │            │  bun run dev:self            │
        │  或已安装的正式版             │            │                              │
        │                              │            │                              │
        │  store  ~/.onething          │            │  store  ~/.onething-dev      │
        │  端口   5173 / 5174 / 8787   │            │  端口   5273 / 5274 / 8887   │
        │  产物   out/                 │            │  产物   dist/dev-self/       │
        │  日志   ~/.onething/log      │            │  日志   ~/.onething-dev/log  │
        └───────────┬──────────────────┘            └──────────────┬───────────────┘
                    │ agent 读/改文件                              │ 起进程跑这份代码
                    │ (read / edit / bash / 测试)                  │
                    ▼                                              ▼
            ┌──────────────────────────────────────────────────────────┐
            │        工作树 /Users/…/start-electron(唯一真相)          │
            └──────────────────────────────────────────────────────────┘
```

A 里的 agent 改的是**工作树文件**,不是 A 自己;B 才是"把这些文件跑起来"的那只。
所以看效果永远看 B,永远不要指望 A 会变。

## 起步四步

1. **在 A 里开一个会话,把工作目录绑到本仓。**
   `/cd /Users/<you>/data/code/start-electron`(或在会话设置里选目录)。
   之后 read/edit/bash/find 的相对路径都以它为根。

2. **选引擎。** 两条路都行,纪律文件是同一份:
   - 原生 provider(claude / codex / deepseek / …)——走 onething 自己的 agent-loop 与工具;
   - Claude Code SDK 外部会话——走 `@anthropic-ai/claude-agent-sdk` 驱动真 CLI。

   两者的系统提示都会把项目根的纪律文件读进去,候选名与顺序见
   `packages/onething-runtime/src/prompts/builder.ts`(`AGENTS.md` 优先、`CLAUDE.md` 垫底,
   上限 64KB —— 本仓 CLAUDE.md 41.7KB,不会被截)。

3. **改码。** 正常用 edit/write/bash;跑测试用 `bun run test`(先 rebuild better-sqlite3,
   耗时但与在跑的实例无冲突),门用 `bun run typecheck` / `boundary:gate` / `ui:gate`。

4. **`bun run dev:self` 起 B,真机走查。**
   默认只起 Electron(桌面宿主):

   ```bash
   bun run dev:self            # = dev:self electron:桌面实例,renderer 5273
   bun run dev:self web        # web 前端 5274 + headless server 8887
   bun run dev:self all        # 两条都起(注意下面的 StoreLock 约束)
   ```

   开机横幅会把 store / 日志 / 端口 / 产物目录逐行打出来 —— 那就是这一只的身份证。

## dev:self 到底隔离了什么

| 维度 | A(日常) | B(dev-self) | 机制 |
| --- | --- | --- | --- |
| store | `~/.onething` | `~/.onething-dev` | `ONETHING_STORE_PATH` → `getOnethingStorePath()` |
| renderer dev server | 5173 | 5273 | `ONETHING_RENDERER_PORT`(`electron.vite.config.ts` 读它);主进程不用改,electron-vite 会把实际端口写进 `ELECTRON_RENDERER_URL` |
| web 前端 | 5174 | 5274 | vite `--port`(dev-unified 传) |
| headless server | 8787 | 8887 | `ONETHING_SERVER_PORT`(本来就是 env 驱动) |
| 主/预加载产物 | `out/` | `dist/dev-self/` | `ONETHING_ELECTRON_OUT_DIR` + `ELECTRON_ENTRY` |
| server bundle | `dist/server/` | `dist/dev-self-server/` | `server:build -- --outDir …` |
| vite 依赖预构建缓存 | `node_modules/.vite/web` | `node_modules/.vite/web-dev-self` | `ONETHING_WEB_CACHE_DIR` |
| Chromium profile | `~/Library/Application Support/Electron` | `<store>/dev-self-user-data` | `electron-vite dev -- --user-data-dir=…` |
| runner 日志 | `~/.onething/log/dev.log` | `~/.onething-dev/log/dev.log` | 日志目录跟着 store 走 |
| 单实例锁 | `~/.onething/run/backend.lock` | `~/.onething-dev/run/backend.lock` | `StoreLock` 天然按 store 路径隔离 |

任何一项都能在外面用同名 env 覆盖,例如换一个 store:

```bash
ONETHING_STORE_PATH=~/.onething-scratch bun run dev:self
```

**空 store 是合法起点。** 脚本不从 `~/.onething` 拷任何东西 —— 拷贝等于两份真相,
要不要播种(设置、主题、插件)由你自己决定,手动 copy 就行。

## 两条泳道为什么不互相误杀

`dev-unified` / `dev-with-logging` 起手都会清扫"本项目的残留 dev 进程"。这套清扫按
**命令行 marker** 划界(`scripts/lib/dev-self.mjs`):dev-self 的每个进程命令行里都带
`dev-self` 这个子串 —— runner 的 `--dev-self`、electron-vite / Electron 的
`dist/dev-self/main/index.js`、Electron helper 继承的 `--user-data-dir=…/dev-self-user-data`、
server 的 `dist/dev-self-server/main.js`;web 前端没有产物路径,用它独占的端口号兜底。
清扫只处理与自己同侧的进程。

改这几个名字要连着 `scripts/lib/dev-self.mjs` 一起改,**改歪了的直接后果是两只实例互相
杀进程**(而且现象是"另一台莫名其妙退出",不会有报错指向这里)。

## 边界与坑(如实)

- **B 要重启/HMR 才反映改动。** 渲染层改动走 vite HMR;主进程 / preload 改动
  electron-vite 会重建并重启 Electron;`electron.vite.config.ts`、脚本本身、依赖变更要手动重起。
- **两实例不共享任何数据**:会话、设置、主题、插件、权限授予、账本全都在各自 store 里。
  在 B 里装的插件 A 看不到,反之亦然。
- **插件只在桌面宿主执行**。`dev:self web` 起的 server 会扫另一棵目录树,
  它的 `/api/plugins/*` 写的 enable 标记桌面根本不读(见 CLAUDE.md 插件系统一节)。
  想验插件就起桌面那条。
- **同一个 store 里 desktop 和 server 不能同时起**:`StoreLock` 一个 store 只允许一位持有者
  (`desktop` / `daemon` / `server`)。所以 `dev:self all` 在桌面已起时,server 泳道会撞锁。
  要同时要两条,给 server 另开一个 store(`ONETHING_STORE_PATH` 指别处再单起)。
- **`bun run test` 会先 `npm rebuild better-sqlite3`**:与正在跑的实例没有冲突(Electron 用的是
  自己那份 ABI),只是每次多花十几秒。
- **验证不改状态**:真机走查时别去点会持久化的控件;要手改 `~/.onething` 下的文件,先把对应
  实例停掉,否则内存里的缓存会把你的手改盖回去。这条对 `~/.onething-dev` 同样成立。
- **`build:native:mac` / `sign:dev:mac` 是共享步骤**:两条泳道起手都会跑一遍(检查即跳过),
  同时起两只时理论上会撞一次写,重跑即可。
- **Dock 上两只都叫 Electron**,图标一样。靠窗口内容(会话列表是空的那只就是 B)或
  `lsof -tiTCP:5273` 分辨。
- **`ELECTRON_CLI_ARGS` 这个 env 传不进去**:electron-vite 的 cli 会用 `options['--']`
  无条件覆盖它(空数组也是真值),所以透传给 Electron 二进制的参数只能走
  `electron-vite dev -- <args>`。dev-self 用 `ONETHING_ELECTRON_ARGS`(JSON 数组)喂给
  `dev-with-logging`,由它拼成 `--` 之后的参数。

## 已知缺口(别把没有的能力写成有)

- **派工是空的**。想让 A 里的 agent 开一个子代理去干活:今天唯一的派工路径是
  `board start`,worker 的 cwd 被强切到群目录,跑完不唤醒父会话,回报硬截 200 字符。
  真正的 Task 工具是审计工单 P0-3(批 5),现在没有。
- **打包版跑不了 Claude Code 外部会话**(按配置推断,未在打包版实测):
  `electron-builder.yml` 的 `asarUnpack` 只放行了 sherpa 与 node-pty,
  `@anthropic-ai/claude-agent-sdk` 连同它要 exec 的 CLI 仍在 asar 里。
  自举开发按现状只在 dev(未打包)运行下可靠。
- **多代理并发写同一份工作树没有隔离**:没有 worktree-per-worker,也没有写前 stale 检查
  (审计工单 P0-6)。同一时间只让一个 agent 改文件。
- **`dev:self` 不做 store 播种、不做数据迁移、不做版本对齐**。B 是干净环境,
  它复现不出 A 的历史数据引起的 bug —— 那种 bug 只能在 A 上查(且遵守"验证不改状态")。
