# 插件系统改造(R0–R7)收官记录

> 对象:`a3114b48` … 收官修复。本文件只记两件**不修代码**的事:
> 一条已知的红,以及它为什么是对的。

## HEAD 上 `boundary:gate` 有 4 条 NEW —— 守卫是对的,红是真的

在**干净工作树**上跑(主树那个绿不作数,原因见下):

```bash
git worktree add --detach /tmp/gatecheck HEAD
ln -s "$PWD/node_modules" /tmp/gatecheck/node_modules
cd /tmp/gatecheck && node scripts/boundary-gate.mjs
```

得到:

```
[boundary-gate] 4 NEW boundary failure(s):
  + [boundary] failed: plugin logic stays out of the host assembly tree
  + [boundary] failed: plugins reach the host only through the injected api object
  + [boundary] failed: packages/core knows no concrete plugin or feature names
  + [boundary] failed: onething.aliases.ts targets exist
```

四条**全部**指向 soul-memory:

| 规则 | 实际内容 |
| --- | --- |
| plugin logic stays out of the host assembly tree | `runtime/src/plugins/soul-memory.ts` 没有 `registerOnething*Plugin` 入口、没有自己的 manifest;`app/plugins/builtin/soul-memory.ts` 门面 1208 行(上限 60) |
| plugins reach the host only through the injected api object | `runtime/src/plugins/soul-memory.ts` 直接 import `../prompts/tasks/index.js` |
| packages/core knows no concrete plugin or feature names | `core/engine/agent-loop-runtime.ts` 读 `settings.general.soulMemory.activeMemory` |
| onething.aliases.ts targets exist | 10 条 `@onething/runtime/memory/*` 死 alias 指向不存在的文件 |

**这不是回归,是 R0 新加的守卫照见了 HEAD 上仍然存在的 soul-memory 代码。**
四条规则本身都是 R0 立的(目录规则、注入 api 唯一通路、core 免知具体功能、
alias 存在性),它们第一次在这棵树上被跑起来,就把这块历史债照了出来。
守卫是对的;红是真的;**不该动基线去把它压下去**。

### 为什么主树是绿的(以及为什么那个绿不作数)

棘轮基线文件 `docs/audit/boundary-baseline-2026-07-25.txt` 本身在用户当前**未提交**
的 142 个改动里,并且已被重录过 —— 它记录的是"soul-memory 退役之后"的世界。
于是在主树上跑,基线与工作树互相自洽,gate 是绿的;而在 HEAD 的快照上跑,基线
(已提交的旧版)与代码(仍有 soul-memory)对不上,四条 NEW 就露出来了。

这正是本战役第 9/10/11 条验证纪律的又一个实例:**"gate 绿"是关于工作树的陈述,
不是关于提交的陈述。**

### 处置

**不修,不动基线。** 基线文件属于用户那条未提交的 soul-memory 退役工作流;
本战役的纪律是绝不卷入他人未提交的改动。用户提交退役工作之后这四条会**自动愈合**
—— soul-memory 的代码与死 alias 一并消失,四条规则的违规项归零。

复现与复核命令如上。若用户提交退役后仍有残留,那时才需要单独处理。

## 附:同一次复验里另一条信息

`[boundary-gate] 1 baseline failure(s) healed` —— `Electron main facades use apps/electron
host imports instead of direct electron imports` 已经好了。同样不动基线(它是用户的),
留待退役工作落库后一并重录。
