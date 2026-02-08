# REQ-011: 启动速度 + 大对话性能优化

> Sprint 4 | 优先级: P1 | PM: Qiqi

## 1. 背景

### 启动速度
当前 `app.on('ready')` 中有 6 个 `await` 串行初始化：
1. `initializeSettings()` — 读设置文件
2. `runAgentMigration()` — 数据迁移
3. `initializeTextMemory()` — 加载记忆索引
4. `initializePromptManager()` — 加载 prompt 模板
5. `startTemplateWatcher()` — 文件监听
6. `initializeToolRegistry()` — 工具注册

还有几个 `.catch()` 异步任务（plugins、MCP、skills、agents）。这些全部串行执行，任何一个慢都会阻塞窗口显示。

### 大对话性能
- `MessageList.vue`（1898 行）用 `v-for` 渲染所有消息，**没有虚拟滚动**
- 当对话 > 100 条消息时，DOM 节点数激增
- 每条消息的 `MessageItem.vue`（666 行）包含复杂的 computed 和子组件
- 每次新消息到达，整个列表可能重新渲染

## 2. 目标

| 指标 | 当前(估) | 目标 |
|------|---------|------|
| 冷启动到窗口可见 | ~2-3s | < 1.5s |
| 冷启动到可交互 | ~3-5s | < 2s |
| 100 条消息滚动帧率 | 未测 | > 55fps |
| 500 条消息滚动帧率 | 卡顿 | > 45fps |
| 新消息渲染延迟 | 未测 | < 16ms |

## 3. 启动速度优化

### 3.1 并行化初始化

当前是串行的，但很多初始化之间没有依赖关系：

```
当前 (串行):
settings → migration → memory → prompt → watcher → tools → window

优化 (并行):
settings → migration ─┐
                      ├→ window (尽早显示)
memory ───────────────┤
prompt + watcher ─────┤
tools ────────────────┘
plugins/MCP/skills ──── (窗口显示后异步)
```

**关键原则: 窗口尽早出现**

```typescript
// 优化后的 app.on('ready')
app.on('ready', async () => {
  // Phase 1: 必须串行的最小集
  initializeStores()
  await initializeSettings()
  await runAgentMigration()

  // Phase 2: 创建窗口（用户看到界面）
  mainWindow = await createWindow()

  // Phase 3: 并行初始化（窗口已可见）
  await Promise.all([
    initializeTextMemory(),
    initializePromptManager().then(() => startTemplateWatcher()),
    initializeToolRegistry(),
  ])

  // Phase 4: 低优先级异步（不阻塞）
  initializePlugins().catch(console.error)
  initializeMCP().catch(console.error)
  initializeSkills().catch(console.error)
  initializeCustomAgents().catch(console.error)
})
```

### 3.2 Settings 懒加载

部分设置（主题列表、快捷键映射）可以延迟加载，只在用户打开设置页面时读取。

### 3.3 启动性能度量

添加简单的计时：

```typescript
const t0 = performance.now()
// ... 各阶段
console.log(`[Startup] Window visible: ${performance.now() - t0}ms`)
console.log(`[Startup] Fully ready: ${performance.now() - t0}ms`)
```

生产环境也保留（用于诊断），通过 `console.log` 不影响性能。

## 4. 大对话性能优化

### 4.1 虚拟滚动

**核心改动**: 引入虚拟滚动，只渲染可视区域内的消息。

**方案选型:**

| 方案 | 优点 | 缺点 |
|------|------|------|
| `@tanstack/vue-virtual` | 轻量、灵活、社区大 | 需要自己处理动态高度 |
| `vue-virtual-scroller` | 开箱即用、支持动态高度 | 包稍大，更新频率低 |
| 自研简易版 | 完全可控 | 工作量大 |

**推荐: `@tanstack/vue-virtual`**
- 轻量（~5KB gzip）
- 支持动态高度（`measureElement`）
- TanStack 生态活跃

**实现思路:**

```vue
<!-- MessageList.vue 核心改动 -->
<template>
  <div ref="scrollContainer" class="message-list" @scroll="onScroll">
    <div :style="{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }">
      <div
        v-for="item in virtualizer.getVirtualItems()"
        :key="messages[item.index].id"
        :ref="el => virtualizer.measureElement(el)"
        :data-index="item.index"
        :style="{
          position: 'absolute',
          top: `${item.start}px`,
          width: '100%',
        }"
      >
        <MessageItem :message="messages[item.index]" />
      </div>
    </div>
  </div>
</template>
```

### 4.2 消息组件优化

**问题**: `MessageItem.vue` 有多个 computed，每条消息都会计算。

**优化:**
1. **`v-memo`** — 对不变的消息跳过重渲染
2. **`shallowRef`** — 消息列表用浅响应，避免深层追踪
3. **组件拆分** — 将 Markdown 渲染、代码高亮等重计算抽成 `defineAsyncComponent`

```vue
<!-- 对已完成的消息跳过重渲染 -->
<MessageItem
  v-for="msg in messages"
  v-memo="[msg.id, msg.parts.length, isStreaming(msg.id)]"
  :message="msg"
/>
```

### 4.3 Markdown 渲染优化

如果使用了 markdown-it 或类似库：
- 对已完成的消息，缓存渲染结果
- 流式消息才实时渲染
- 代码高亮用 `requestIdleCallback` 延迟

### 4.4 大对话分页（可选）

对超长对话（> 500 条），可以：
- 只保留最近 100 条在 DOM
- 向上滚动时动态加载更早的消息
- 结合虚拟滚动实现

## 5. 实施计划

### Phase 1: 度量基线
- 添加启动计时日志
- 创建性能基准测试（Playwright 测量启动时间）
- 用 DevTools Performance 录制大对话滚动
- **产出: 性能基线报告**

### Phase 2: 启动优化
- 并行化初始化
- 窗口尽早显示
- 验证启动时间改善

### Phase 3: 虚拟滚动
- 安装 `@tanstack/vue-virtual`
- 改造 `MessageList.vue`
- 处理动态高度、自动滚动到底部、锚定滚动
- 验证大对话性能

### Phase 4: 渲染优化
- `v-memo` 跳过不变消息
- Markdown 渲染缓存
- 代码高亮延迟加载

## 6. 影响分析

### 需要修改的文件

| 文件 | 改动 | 风险 |
|------|------|------|
| `src/main/index.ts` | 并行化初始化 | 低 — 逻辑不变，只改执行顺序 |
| `src/renderer/components/chat/MessageList.vue` | 虚拟滚动 | **高** — 核心组件大改 |
| `src/renderer/components/chat/MessageItem.vue` | v-memo 优化 | 低 — 仅模板层面 |
| `package.json` | 添加 `@tanstack/vue-virtual` | 低 |

### 风险点
- **虚拟滚动 + 自动滚动到底**: 流式消息时需要保持自动滚动，这和虚拟滚动的交互需要仔细处理
- **动态高度**: 消息高度不固定（代码块、图片），需要 `measureElement` 实时测量
- **键盘导航**: 如果有上下键选择消息，需要和虚拟滚动兼容

## 7. 成功标准

- [ ] 启动计时可量化（有 baseline 和 after 数据）
- [ ] 冷启动到窗口可见 < 1.5s
- [ ] 500 条消息对话滚动流畅（> 45fps）
- [ ] 流式消息渲染不卡顿（< 16ms per frame）
- [ ] 现有 256+ 测试不受影响
- [ ] E2E 测试（REQ-010）覆盖大对话场景

## 8. 依赖

- REQ-010 (E2E 测试) — 用于验证性能优化不破坏功能
- REQ-009 (UIMessage 迁移) — ✅ 已完成，虚拟滚动基于 UIMessage

---

*Created: 2026-02-08 by Qiqi*
