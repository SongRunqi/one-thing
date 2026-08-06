# 追加审计:`a962c828` 携带的非本工作删除行(勘误)

> 对象:`a962c828 refactor(ui): 面板注册表收编手写联合类型与入口特例`
> 起因:R5 三路评审复验发现该提交 message 里的"携带清单"漏记一行,
> "逐行列明"这条纪律因此没有闭合。本文件把账目补齐并作为该提交的追加记录。

## 结论

该提交携带的、与面板注册表重构**无关但因类型/编译不可分割**的 soul-memory
退役删除行,实际是 **16 行**,不是 message 里写的 15 行。

漏记的一行:

```
packages/renderer/components/MediaPanel.vue
-  { id: 'memory', label: 'Memory', icon: Brain },
```

它是 MediaPanel `navItems` 数组里的 memory 项。原 message 记了 Sidebar 的
`workspaceActions` 里同形状的那一行,却漏了 MediaPanel 这一处 —— 两处是同一类
手抄清单,被一起收编进注册表,只有一处被写进账。

## 完整清单(16 行)

| 文件 | 行数 | 内容 |
| --- | --- | --- |
| `MediaPanel.vue` | 9 | memory 面板的 `<section>` 整块(`hasMountedNav('memory')` 在 memory-less 的联合下是类型错误,必须同去) |
| `MediaPanel.vue` | 1 | `import MemoryPanelContent` |
| `MediaPanel.vue` | 1 | 图标 import 里的 `Brain,` |
| `MediaPanel.vue` | 1 | **`navItems` 里的 `{ id: 'memory', label: 'Memory', icon: Brain }`(本次补记)** |
| `Sidebar.vue` | 1 | `workspaceActions` 里的 `{ id: 'memory', icon: Brain }` |
| `App.container-layout.test.ts` | 3 | memory 相关的 mediaPanel 断言(`hasMountedNav('memory')` / `data-workspace-panel-view` / `v-else-if activeNav === 'memory'`) |

另有 6 处 `'memory'` 成员位于**本重构本来就要整行重写**的行内(App.vue 联合 ×1、
Sidebar.vue props 联合与本地联合 ×2、Sidebar 图标 import ×1、MediaPanel 联合与
`normalizeNav` 条件 ×2)—— 这些行无论如何都会被替换,不计入"携带"。

核对命令(可复现):

```bash
git show a962c828 | grep -E '^-' | grep -vE '^--- ' | grep -inE 'memory'   # → 16
```

## 同时勘误:漂移叙事

原 message 与若干代码注释复述过一句:

> Sidebar 的 props 联合残留死成员 `'memory'`,而同文件的本地联合已经没有它

这句话的**审计对象是当时未提交的工作树**,不是提交基线 —— 在 `a962c828` 的父提交上,
Sidebar 的两个联合**都**含 `'memory'`,并不存在不同步。真实情况是:soul-memory 退役
的工作树里两处删除进度不一致,而那正好示范了同一种失效模式(手抄清单在**删除**时
同样会漏一处)。

R5 评审修复提交已把这句话改写到位,涉及三处:

- `packages/renderer/workspace/panel-registry.ts` 文件头
- `packages/renderer/components/sidebar/Sidebar.vue` props 联合上方注释
- `packages/renderer/workspace/__tests__/panel-registry.test.ts` 守卫用例注释

提交基线上确实存在、且被这次重构治好的漂移有两条,它们不受本勘误影响:

- `MediaPanel.vue` 的联合多出 `'archive'`,别处的联合都没有;
- 侧栏 `workspaceActions` 漏了 `practice` —— 那个面板于是只能靠一条 window 事件
  进入,图标入口根本不存在。

## 排除项(仍留在工作树,未被携带)

- `App.vue` 的 `--app-seam-line` 变量与接缝 border(窗口边框归属改动)
- `App.container-layout.test.ts` 里 "memory panel loading" 那条用例的断言
- 其余全部 soul-memory 退役改动

---

## 追加发现:`a962c828` 把树留成了红的(两个文件)

复核携带清单时,在**干净的 git worktree 上跑提交本身**(`git worktree add --detach`),
两个测试文件失败 —— `MediaPanel.test.ts` 与 `Sidebar.workbench.test.ts`:

```
× keeps visited workspace panel views mounted when switching the active tab
  AssertionError: expected false to be true
```

```
× 工作区面板入口一个都不丢 > workbench:平铺 dock 与脚栏都没了
  Error: 没有哪张菜单装着 memory
```

成因:`a962c828` 从 `MediaPanel.vue` 的 `navItems` 与 `Sidebar.vue` 的
`workspaceActions` 里移除了 `memory` 项(注册表不含 memory),但这两个测试在同一
提交里**没有**跟着改。当时的携带清单只审计了 `App.container-layout.test.ts`,漏了
这两个同类文件;而全量测试跑在**工作树**上(那里 memory 断言已被退役工作删掉),
于是绿灯掩盖了红的 HEAD。

同一次复验也划清了边界:`prompt-golden` 与 `system-prompt.baseline` 的 7 个失败在
`a962c828~1` 上**就已经是红的**(soul-memory 提示词内容尚未提交),不属于这条线。

教训很具体:**"全量测试通过"是对工作树的陈述,不是对提交的陈述**。做窄例外携带时,
自检必须落在提交上 —— `git worktree add --detach <tmp> HEAD` 然后在那里跑测试与
typecheck。逐文件比对 `git show HEAD:<file>` 只能证明"没多删",证明不了"树是绿的"。

### 修复

R5 评审修复提交把两个测试整份落库,携带 8 + 5 = 13 行删除(与已获批的
"面板相关 memory 删除"同一类别)。

`MediaPanel.test.ts`(8 行):

```
-vi.mock('../memory/MemoryPanelContent.vue', () => ({
-  default: { template: '<div />' },
-}))
-                                                   （空行)
-      props: { visible: true, mode: 'main', activeTab: 'memory' },
-    expect(wrapper.find('[data-workspace-panel-view="memory"]').exists()).toBe(true)   ×3
```

同时把该用例改写为在 `tasks / media / agents` 之间切换 —— 覆盖的仍是"访问过的
面板视图保持挂载"这一命题,不再依赖一个已经不存在的面板。

`Sidebar.workbench.test.ts`(5 行):菜单期望数组里的 `'memory'` 项与
`menuWithItem(wrapper, 'memory')` 定位,改为以 `'media'` 定位、期望
`['media', 'agents', 'tasks', 'music']`。

### 账目合计

`a962c828` + 本次修复,面板注册表这条线累计携带的 soul-memory 删除行为
**16 + 13 = 29 行**。排除项不变(`--app-seam-line`、"memory panel loading" 用例、
其余全部退役改动仍在工作树)。
