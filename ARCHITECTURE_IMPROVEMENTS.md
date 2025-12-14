# 架构改进计划

## 当前架构评估

### 做得好的地方
1. **IPC 通信模块化** - `src/main/ipc/` 按功能分离
2. **安全实践** - contextIsolation + nodeIntegration:false
3. **类型共享** - `src/shared/ipc.ts` 统一定义类型
4. **存储重构** - 从 electron-store 迁移到模块化文件存储

---

## 📋 完整 TODO List

### 一、代码结构与架构 (高优先级)

| # | 任务 | 说明 | 难度 |
|---|------|------|------|
| 1.1 | **拆分大型组件** | `SettingsPanel.vue` 有 2600+ 行，应拆分为子组件 | 中 |
| 1.2 | **统一组件目录结构** | 建立 `components/settings/`、`components/chat/`、`components/common/` 分类 | 低 |
| 1.3 | **添加 composables 层** | 将复杂逻辑抽取到 `src/renderer/composables/` | 中 |
| 1.4 | **IPC 类型安全强化** | 为 `window.electronAPI` 生成完整的类型声明 | 低 |

### 二、主题与样式系统 (中优先级)

| # | 任务 | 说明 | 推荐方案 |
|---|------|------|----------|
| 2.1 | **CSS 变量管理** | 集中管理 CSS 变量 | 创建 `styles/variables.css` + 主题文件 |
| 2.2 | **是否需要第三方主题库？** | **不推荐** | 保持现状，优化组织方式 |
| 2.3 | **组件样式统一** | 抽取重复样式到全局 | 创建 `styles/components.css` |
| 2.4 | **响应式支持** | 添加媒体查询断点 | sidebar 自动折叠等 |

### 三、可维护性与扩展性 (高优先级)

| # | 任务 | 说明 | 收益 |
|---|------|------|------|
| 3.1 | **Provider 注册机制优化** | 实现插件化注册 | 新增 Provider 只需一个文件 |
| 3.2 | **配置 Schema 验证** | 使用 Zod 验证 settings | 防止配置损坏导致崩溃 |
| 3.3 | **错误边界组件** | Vue ErrorBoundary | 提升用户体验 |
| 3.4 | **统一日志系统** | 使用 electron-log | 可持久化、可分级 |
| 3.5 | **添加单元测试** | 覆盖 stores、IPC handlers | 保证代码质量 |

### 四、安全与性能 (中优先级)

| # | 任务 | 说明 |
|---|------|------|
| 4.1 | **添加 CSP 头** | 防止 XSS |
| 4.2 | **API Key 安全存储** | 使用系统钥匙串 (keytar) |
| 4.3 | **输入验证** | IPC handlers 验证参数 |
| 4.4 | **消息流式传输** | 支持 streaming |

### 五、开发体验 (低优先级)

| # | 任务 | 说明 |
|---|------|------|
| 5.1 | **ESLint 配置补全** | 添加 `.eslintrc` |
| 5.2 | **Git Hooks** | husky + lint-staged |
| 5.3 | **TypeScript 严格模式** | 逐步开启 strict |

---

## Phase 1 详细计划 (立即执行)

### 1.1 拆分 SettingsPanel 组件

**目标结构：**
```
src/renderer/components/
├── settings/
│   ├── SettingsPanel.vue          # 主容器（保留）
│   ├── ProviderSelector.vue       # Provider 下拉选择器
│   ├── ProviderConfig.vue         # API Key、Base URL 配置
│   ├── ModelSelector.vue          # 模型选择网格
│   ├── ThemeSelector.vue          # 主题选择卡片
│   ├── AnimationSettings.vue      # 动画速度滑块
│   ├── CustomProviderDialog.vue   # 自定义 Provider 弹窗
│   └── UnsavedChangesDialog.vue   # 未保存更改弹窗
```

**拆分原则：**
- 每个子组件 < 300 行
- 通过 props/emit 通信
- 共享状态通过 provide/inject 或直接传递

### 2.3 抽取通用组件样式

**目标结构：**
```
src/renderer/styles/
├── variables.css      # CSS 变量定义
├── base.css           # reset + 基础样式
├── components.css     # 通用组件样式 (.btn, .input, .card, .dialog)
└── main.css           # 入口文件，导入以上所有
```

### 3.1 Provider 注册机制优化

**目标：添加新 Provider 只需创建一个定义文件**

**当前问题：添加新 Provider 需要修改 6 个文件**
1. `src/main/providers/index.ts` - creator + registry
2. `src/main/ipc/models.ts` - fallback + switch
3. `src/shared/ipc.ts` - enum
4. `src/renderer/stores/settings.ts` - 默认配置
5. `src/renderer/components/ChatWindow.vue` - 列表
6. `src/renderer/components/SettingsPanel.vue` - logo

**重构方案：**
```
src/main/providers/
├── registry.ts        # 注册器核心
├── types.ts           # Provider 定义类型
├── builtin/
│   ├── openai.ts
│   ├── claude.ts
│   ├── deepseek.ts
│   ├── kimi.ts
│   ├── zhipu.ts
│   └── index.ts       # 自动加载所有内置 provider
└── index.ts           # 导出
```

---

## 执行顺序

1. **[1.1]** 拆分 SettingsPanel 组件
2. **[2.3]** 抽取通用组件样式
3. **[3.1]** Provider 注册机制优化

---

## 进度跟踪

- [x] Phase 1 ✅ (2024-12-15 完成)
  - [x] 1.1 拆分 SettingsPanel 组件
    - 创建 `CustomProviderDialog.vue` - 自定义 Provider 添加/编辑弹窗
    - 创建 `UnsavedChangesDialog.vue` - 未保存更改提示弹窗
    - 创建 `DeleteConfirmDialog.vue` - 删除确认弹窗
  - [x] 2.3 抽取通用组件样式
    - 创建 `styles/components.css` - 包含 .btn, .dialog, .form-* 等通用样式
    - 在 `main.css` 中导入
  - [x] 3.1 Provider 注册机制优化
    - 创建 `types.ts` - Provider 类型定义
    - 创建 `registry.ts` - 注册器核心
    - 创建 `builtin/` 目录，每个 Provider 一个文件
    - 添加新 Provider 只需：创建文件 + 在 builtin/index.ts 导出
- [ ] Phase 2
- [ ] Phase 3

---

## 已完成的改进

### 新目录结构

```
src/renderer/components/
├── settings/
│   ├── CustomProviderDialog.vue   ✅
│   ├── UnsavedChangesDialog.vue   ✅
│   └── DeleteConfirmDialog.vue    ✅

src/renderer/styles/
├── main.css                       # 入口 + CSS 变量
└── components.css                 ✅ 通用组件样式

src/main/providers/
├── index.ts                       # 主入口 (重构)
├── types.ts                       ✅ 类型定义
├── registry.ts                    ✅ 注册器
└── builtin/
    ├── index.ts                   ✅ 自动导出所有 Provider
    ├── openai.ts                  ✅
    ├── claude.ts                  ✅
    ├── deepseek.ts                ✅
    ├── kimi.ts                    ✅
    └── zhipu.ts                   ✅
```
