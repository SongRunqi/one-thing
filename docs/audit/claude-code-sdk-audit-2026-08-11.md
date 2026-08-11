# Claude Code SDK 接入(external-agents 线)审计

2026-08-11,只读审计。结论与工单;逐条代码证据(文件:行)见审计原始报告。

## 一句话总判断

**真接通、真跑得起来的驱动;配置面与失败面还是展品。** 数据流(流式/思考/
工具卡/diff/权限/提问/中断/resume/记账)全线打通且有测试兜底,E0-E6 **七期
全部落地**——项目记录"E2 未做"是过时的(9cf725f2,2026-08-06 交付,
设计文档 §10.1/§10.3 未跟上,会误导读者)。自举开发**能用但要人盯**,
且今天只能在 dev 模式跑(打包缺 asarUnpack)。

## 核账要点

- E0-E6 七期全活,无断线;十缺口(G1/G2/G6/G7/G8/G9/G10)全部已修或换路解决。
- `supportsTools:false` **是正确的值**(外部 agent 的工具在自己进程执行,
  引擎再装会发两遍等一个永不回来的结果),旧记录把它当病根是误读。
- `permissionGuard:'external'` 是**死枚举值**且 fail-closed(不在可注入名单,
  声明它的工具会被拒绝注入)——"会被跳过"指跳过注入,不是跳过审批,全仓
  无生产消费者。
- diff 呈现是最扎实的一块:从 Edit/Write/MultiEdit 参数合成 diff 走本地 diff UI。
- SDK 漂移极小(^0.3.214 vs 0.3.227,同 minor),connector 是软依赖(结构化
  子集类型+可注入 queryFn),升级成本≈改一行;真风险在**本机 CLI 版本偏斜**
  (SDK 0.3.214 驱动本机 2.1.227,协议兼容无断言)。

## 自举开发的四堵墙

1. **失败沉默**(最严重):`translateResult` 丢掉错误原文,rate limit/额度
   用尽/登录过期/resume 失效在 UI 上全表现为"回合突然结束什么都没说",
   只进 console.warn。
2. **cwd 未绑定无警示**:兜底 `process.cwd()`,打包后是 `/`——Claude Code
   在空目录里困惑摸索,无任何提示。
3. **打包缺 asarUnpack**:没装本机 CLI 的用户 fallback 到 asar 里的二进制,
   spawn 必失败(external-agents-integration.md 自记为 P5 待实施)。
4. **审批粒度只到工具名**:一次"总是允许 Bash"= 此后任何命令免审(本地
   bash 有命令级 effect,外部没有)。

## 两不管地带(权限衔接,真发现)

- `settingSources` 未传 → SDK 默认加载全部文件系统设置:用户 `~/.claude/
  settings.json` 的 allow 规则在 CLI 侧**先行放行**,`canUseTool` 不被调用,
  onething 的 Permission 一个字看不到。开发者机器上白名单常见,自举场景致命。
- auto-deny 同样不可见:`SDKPermissionDeniedMessage` 是 `type:'system'`,
  translator 只认四种类型,被拒工具在 UI 上凭空消失。
- 附带的白捡与风险:默认全加载使**仓库 CLAUDE.md 被读到**(自举刚需),
  但这是靠默认值,未写注释,SDK 默认值一变即静默丢失。

## 其它值得记的

- 提问 120s deadline 不可延长(倒杯咖啡回来它已"按最稳妥的路继续")。
- 真实成本被丢在半路:`total_cost_usd` 采集了、发成 provider-data,气泡跳过
  不渲染、账本不吃;伪模型 `claude-code-agent` 无单价 → 成本 null。
- steering 未接(SDK 有 streamInput/Query.interrupt,连接器没用)——这条线
  性价比最高的功能增量。
- 图片静默丢弃(imagesIn:false 且只取文本)。
- resume 失效无降级(link 过期→整轮炸掉,应清 link 无 resume 重跑)。

## 工单

**P0**:1 失败说话(translateResult 带上错误原文) · 2 cwd 空时拒跑或警示 ·
3 asarUnpack 补包 · 4 外部审批粒度(Bash 按命令、文件按路径)
**P1**:1 设计文档 §10.1/§10.3 改写(E2 已交付) · 2 settingSources 显式决策 ·
3 auto-deny 可见 · 4 提问超时放宽 · 5 成本接账 · 6 resume 降级 · 7 CLI 版本
偏斜断言/记录
**P2**:图片 · steering · messageId 死参数 · session-links 无界增长 ·
workingDirectoryRoots 未传 · setPermissionMode 未用

## 建议路径

一天止血(P0-1/2 + P1-1)→ 半天信任(P0-4 + P1-2/3)→ 半天账(P1-4/5/6)→
打包前必做 P0-3 → 增值首选 steering。
