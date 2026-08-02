# Agent Sandbox（Rust）设计方案 —— 真实 · 确定 · 可复现 · 跨平台

日期：2026-08-02
状态：方案（未实施）
宿主目标：**macOS（Intel + Apple Silicon）、Windows 10/11、Linux** —— 三平台一等公民

---

## 0. 三个词各自意味着什么（先把目标拆干净）

| 目标 | 精确定义 | 达成手段 |
| --- | --- | --- |
| **真实** | 跑的是真实进程、真实 ELF/脚本、真实文件系统语义、真实网络协议栈 —— 不是 mock、不是解释器模拟 | VM 里跑真 Linux |
| **确定** | 相同输入 → 逐字节相同输出。前提是把所有非确定性**输入源**收编：时间、熵、网络、环境、文件系统初态 | 封闭化（hermetic）：内容寻址的 rootfs + 固定 env + 虚拟时钟 + 固定 seed + 网络录制回放 |
| **可复现** | 任何一次历史执行，拿着它的 manifest 在任何机器上重跑，能得到相同结果；结果本身可校验（哈希） | 执行 manifest + 结果 digest + 网络/FS 全量录制 |
| **跨平台** | 三大桌面 OS 上行为一致；一台 mac 上录的执行，在 Windows 上 replay 得到相同 digest | 三平台跑**同一个 guest 环境**（同 digest 的内核+rootfs），宿主差异被压到 VMM 加速器一层 |

**必须先说清楚的工程事实**：对"任意代码"做全量确定性执行是研究级难题（多线程调度、指令级时序、`/proc` 噪声都能泄漏非确定性）。所以本方案的立场是：**不承诺指令级确定，承诺"输入封闭 + 输出可验证"**——

1. 把所有非确定性来源变成**显式的、被记录的输入**（strict 模式下则直接钉死）；
2. 每次执行产出一份 manifest（输入的哈希）+ 一份 result（输出的哈希）；
3. "可复现" = 同 manifest 重跑 → 比对 result digest。绝大多数 agent 工作负载（编译、测试、脚本、数据处理）在输入封闭后天然确定；剩下的（真依赖挂钟时间/竞态的程序）会被**检测出来并标记**，而不是假装确定。

这与 Nix/Bazel 的 hermeticity 哲学一致，但作用对象是 agent 的任意 bash 命令而非构建规则。

---

## 1. 总体架构

```
onething (Electron main / apps/server)          [mac / win / linux]
   │  NDJSON RPC（unix socket；Windows 上 named pipe），与 CLI daemon 同风格
   ▼
┌──────────────────────────────────────────────────────────┐
│  sandboxd（Rust 单二进制守护进程，三平台同源编译）           │
│                                                          │
│  ├─ RPC 层        exec / replay / verify / snapshot / gc  │
│  ├─ 镜像层        OCI rootfs 拉取·内容寻址缓存·layer 组装   │
│  ├─ 执行层        trait Vmm → QemuBackend（QMP 驱动）      │
│  │                VM 池预热；每次执行一个干净 overlay        │
│  ├─ 网络层        guest slirp 用户态网络 → 宿主侧 MITM 代理  │
│  │                （off / record / replay / live 四档）     │
│  ├─ 录制层        stdout/stderr 时间线、FS diff layer、     │
│  │                net log —— 全部内容寻址落盘               │
│  └─ 账本          manifest.json + result.json（可校验）     │
└──────────────────────────────────────────────────────────┘
   │ 捆绑的 qemu-system-*（加速器按宿主选择）
   │   macOS: HVF（Intel 与 ARM 都支持）
   │   Windows: WHPX（Hyper-V 平台）
   │   Linux: KVM
   │   任何平台无硬件虚拟化时: TCG 纯模拟（慢 5-10x，但可用且更确定）
   ▼
┌──────────────────────────────────────────────────────────┐
│  Guest：固定版本 Linux 内核 + 内容寻址 rootfs（三平台同 digest）│
│  ├─ init（Rust musl 静态二进制，guest agent）：virtio-serial │
│  │   通道收 exec 请求、设 env/cwd/clock、跑命令、流式回传     │
│  ├─ overlayfs：lowerdir=镜像层(只读盘) upperdir=工作盘       │
│  │   diff = upperdir 规范化 tar（排序、mtime 归一）          │
│  └─ 无直连网络，slirp 出口唯一指向宿主代理                    │
└──────────────────────────────────────────────────────────┘
```

### 1.1 为什么底座是"捆绑 QEMU"

跨平台是硬约束，直接排除了一批候选：

| 方案 | mac Intel | mac ARM | Windows | Linux | 结论 |
| --- | --- | --- | --- | --- | --- |
| libkrun | ❌ | ✅ | ❌ | ✅ | 出局（上一版方案的死因） |
| firecracker / cloud-hypervisor | ❌ | ❌ | ❌ | ✅ | 出局（KVM-only） |
| Virtualization.framework | ✅ | ✅ | ❌ | ❌ | 出局 |
| WSL2 | — | — | ⚠️ 要用户装 | — | 不当依赖，只当 Windows 的可选加速路径研究 |
| Docker Desktop | ⚠️ | ⚠️ | ⚠️ | ⚠️ | 重依赖 + 商业授权问题，出局 |
| wasmtime (WASI) | ✅ | ✅ | ✅ | ✅ | 跑不了任意 bash，只配当纯计算加速档（Tier A） |
| **QEMU（捆绑）** | ✅ HVF | ✅ HVF | ✅ WHPX | ✅ KVM | **唯一三平台全绿的真实执行底座** |

这不是妥协选择——Lima、Podman machine、UTM、Android 模拟器全走这条路，成熟度和工具链是所有候选里最高的。额外两个赠品：

- **TCG 兜底**：无硬件虚拟化的机器（公司管控 Windows、嵌套虚拟化环境、老 CPU）降级纯模拟，慢但**照样真实+确定**——sandbox 永远可用，只是快慢之分。
- **QEMU record/replay（icount）**：TCG 模式自带指令级确定重放。不做主路线（太慢），但给了一个未来的"法证档"：某次执行需要指令级复现时，切 TCG+icount 重录。

代价与对策：

- **发行体积**：每平台捆一个裁剪过的 `qemu-system`（只留需要的 machine/device，静态化依赖），压缩后约 15-30MB；guest 内核+rootfs 首次运行时下载（digest 校验），不进安装包。
- **QEMU 是 GPLv2**：独立进程调用（QMP socket 控制），不链接进我们的二进制，随包附源码 offer 即合规——Lima/UTM 同款做法。
- **启动比 microVM 慢**：直接内核启动（`-kernel` + initramfs，跳过 BIOS/引导器）+ microvm/virt 精简机型 + VM 池预热，冷启压到 ~1s，预热命中 <100ms，见 P4。
- `trait Vmm` 仍然保留：Linux server 侧未来可上 cloud-hypervisor/libkrun 榨性能，mac ARM 可上 libkrun——但那是**优化**，基线永远是"三平台同一个 QEMU 后端"，保证行为一致性有唯一参照。

### 1.2 跨平台差异被压在哪一层（设计的关键纪律）

原则：**宿主 OS 只提供 CPU 加速和文件存储，语义全部在 guest 里** —— 三平台的 guest 是同 digest 的内核+rootfs，执行结果的一致性由此而来。为此几个组件特意选了"最大公约数"而不是"各平台最优"：

| 组件 | 不选（因为有平台缺口） | 选择（三平台通吃） |
| --- | --- | --- |
| 宿主↔guest 通道 | vsock（vhost-vsock 仅 Linux 宿主） | **virtio-serial** 字符通道，NDJSON 协议 |
| 文件注入/提取 | virtio-fs（virtiofsd 仅 Linux 宿主）、9p（性能与语义坑） | **不共享文件系统**：输入打包成只读盘镜像挂进去，输出由 guest agent 从 overlay upperdir 打规范化 tar 经 virtio-serial 传回 |
| guest 网络 | TAP/bridge（三平台权限模型各异，Windows 要驱动） | **slirp 用户态网络**：无特权、三平台一致，且天然只有一个出口——宿主代理，网络管控不靠防火墙规则而靠拓扑 |
| 宿主 RPC | — | unix socket（mac/linux）/ named pipe（win），interprocess crate 抹平 |

**guest CPU 架构与跨架构复现**：x86 宿主跑 x86_64 guest、ARM 宿主跑 aarch64 guest（各自硬件加速）。manifest 里带 `arch` 字段，**复现承诺默认是同架构内的**（跨架构连编译产物都不同，逐字节相同本就不成立）。需要跨架构精确 replay 时有个后门：ARM mac 用 TCG 模拟 x86_64 guest（慢但可行）——称为 uniform-arch 模式，按需使用。基础镜像因此发布双架构 digest，manifest 引用其一。

### 1.3 Rust 技术选型

- **VMM 控制**：自研 `QemuBackend`——spawn 捆绑的 qemu-system，QMP（QEMU 的 JSON RPC）做生命周期控制，virtio-serial 上跑自定义 guest 协议。不依赖 libvirt。
- **guest init/agent**：Rust musl 静态小二进制，编 x86_64 + aarch64 双份进各自 rootfs。
- **镜像**：`oci-distribution` + `oci-spec` 拉标准 OCI 镜像；层按 sha256 内容寻址存储，组装成 ext4 只读盘镜像（宿主侧用纯 Rust ext4 写入器生成，不依赖宿主有 mkfs）。基础镜像我们自己发布（固定 digest 的 debian-slim + 常用工具链，双架构）。
- **网络代理**：宿主侧 `hudsucker`（Rust MITM 代理 crate）或自写 hyper 层；guest 内预置我们的 CA。
- **RPC**：`interprocess` crate（unix socket / named pipe 统一抽象）+ NDJSON，复用 onething CLI daemon 的协议风格。
- **哈希/存储**：blake3 内容寻址；账本追加式 JSONL（与会话存储风格一致）。

---

## 2. 确定性的具体收编清单

每个非确定源，三种档位：**strict**（钉死）/ **recorded**（记录成输入）/ **live**（放行并把执行标记为不可复现）。

| 非确定源 | strict | recorded | live |
| --- | --- | --- | --- |
| 文件系统初态 | rootfs digest + 输入文件打包成 input layer（哈希入 manifest） | 同左 | — |
| 环境变量 | 白名单 + 显式值，全量入 manifest | 同左 | 透传宿主 env（标记） |
| 挂钟时间 | guest RTC 钉在 manifest 里的 epoch（QEMU `-rtc base=` 直接支持）；单调钟从 0 起 | 记录首次读取值 | 真实时间 |
| 熵（getrandom/urandom） | init 用 manifest 里的 seed 初始化熵池；LD_PRELOAD interpose 兜底 | 记录读出的字节流 | 真随机 |
| 网络 | 直接断网（默认） | **MITM 代理全录制**，重放时从录制应答；slirp 拓扑保证无旁路 | 直连（标记） |
| CPU 并发 | 单 vCPU（消除大部分调度竞态） | 多核 + 不承诺 | 多核 |
| PID/uid/主机名/locale/TZ | 固定值（pid=1 起、hostname=sandbox、TZ=UTC、LANG=C.UTF-8） | 同左 | 同左 |
| DNS | 走代理统一解析并录制 | 同左 | 真实 |
| 宿主 OS / 加速器差异 | 不进 guest 语义（见 §1.2）；manifest 记 `arch`，复现按架构对齐 | — | — |

**确定性自检（这是本方案的验收器）**：`sandboxd verify <manifest>` = 同 manifest 连跑 N 次，逐字节比对 stdout/stderr/FS-diff/exit code 的 digest。CI 在三平台跑同一组标杆负载（编译 Rust crate、跑 vitest、pip install + pytest、curl 录制回放），**跨平台比对 digest** —— "mac 上录、Windows 上放"从口号变成 CI 断言。跑不齐的负载会得到明确的 `nondeterministic: true` 标记和首个分歧点——**诚实报告比假装确定重要**。

---

## 3. 执行账本（可复现的载体）

```jsonc
// manifest（执行前即确定，本身可哈希 → execution id）
{
  "arch": "x86_64",              // 复现承诺的架构边界
  "image": "sha256:…",           // rootfs digest（该架构）
  "input_layer": "blake3:…",     // 注入的工作区文件
  "cmd": ["bash","-lc","cargo test"],
  "env": { "PATH": "…", "CARGO_HOME": "/cache/cargo" },
  "cwd": "/work",
  "clock": { "mode": "strict", "epoch": 1770000000 },
  "entropy": { "mode": "strict", "seed": "…" },
  "net": { "mode": "record" },   // replay 时改成 {"mode":"replay","log":"blake3:…"}
  "vcpu": 1, "mem_mb": 2048, "timeout_s": 600
}

// result（执行后）
{
  "exit_code": 0,
  "stdout": "blake3:…", "stderr": "blake3:…",   // 内容寻址，含时间戳流原件
  "fs_diff": "blake3:…",                        // upperdir 规范化 tar
  "net_log": "blake3:…",
  "usage": { "wall_ms": 8123, "cpu_ms": 7900, "max_rss_mb": 412 },
  "host": { "os": "darwin", "accel": "hvf" },   // 仅供诊断，不参与 digest
  "deterministic": true                         // verify 过则为 true
}
```

三个动词：

- `exec(manifest) -> result` —— 跑，顺手录。
- `replay(execution_id) -> result'` —— 网络从录制回放、其余输入同 manifest 重跑（任何平台）。
- `verify(execution_id)` —— replay 后比对 digest，写回 `deterministic` 标记。

FS diff 是内容寻址的 layer，意味着**多步 agent 任务可以链式执行**：上一步的 `fs_diff` 作为下一步追加的只读层——整条任务链变成一个可重放的 DAG，任何中间态可以 fork 出分支重试（agent "撤销重来"的物理基础）。链条本身也是跨平台的：mac 上跑到第 3 步的任务，manifest 链拷到 Linux server 上能从第 4 步接着跑。

---

## 4. 三档执行 Tier

| Tier | 载体 | 延迟 | 用途 |
| --- | --- | --- | --- |
| A | wasmtime | ~ms | 纯计算内置工具（将来可选，不在主线里） |
| **B** | **QEMU VM** | 预热池 <100ms，冷启 ~1s（TCG 兜底时更慢） | **agent bash / 任意命令，主路线** |
| C | 宿主直跑（现状的 `createLocalBashOperations`） | 0 | 用户明确要操作宿主真机时（开发自己电脑上的项目）；无确定/复现承诺 |

Tier C 保留很重要：onething 的 agent 经常就是要动用户自己的机器（改这个 repo、开 dev server）。**sandbox 不是替换宿主执行，而是新增一种执行目标**，由会话/工具配置选择路由。

---

## 5. 与 onething 的接入

现有缝隙已经够用，不需要改工具层协议：

- `packages/onething-runtime/src/tools/bash-executor.ts` 的 `BashOperations` 接口（现由 `createLocalBashOperations` 实现，`node:child_process` spawn）——新增 `createSandboxBashOperations`：同接口，内部走 sandboxd RPC，流式回传 stdout/stderr。Tier 路由在这一层做。
- 装配：`packages/onething-runtime/src/app` 里新增 `configureSandboxdHost` 端口（与 `configureSandboxHost` 等七个既有端口同款式样），Electron 主进程和 apps/server 各自注入 socket/pipe 路径与生命周期管理；`createOnethingBackend` 的 `afterTools` hook 里完成 wiring。
- 权限：不动。permission ask 依旧在工具执行前发生；sandbox 只是改变"批准之后在哪里跑"。可给权限 UI 多一个信息位：`target: host | sandbox`，sandbox 目标可配置更宽的自动放行（毕竟隔离了）。
- 进程管理：sandboxd 由宿主 app 拉起，`StoreLock.acquire('sandboxd')` 防多开；镜像与账本存 `<store>/sandbox/`。

仓库形态：`native/sandboxd/` 下新建 Cargo workspace（`sandboxd` + `sandbox-guest-init` + `sandbox-proto` 三个 crate），三平台交叉编译产物随 electron-builder 打包进资源目录；裁剪版 QEMU 每平台一份随包；guest 内核 + 基础 rootfs（双架构）首次运行时下载（digest 校验）。

---

## 6. 分期（完整总览）

| 期 | 交付 | 验收 |
| --- | --- | --- |
| **P0 技术尖刺** | 捆绑裁剪 QEMU 在 **mac(HVF)/win(WHPX)/linux(KVM)** 三平台跑通：直接内核启动固定 rootfs → guest init 经 virtio-serial 收命令 → 流式回传 → 拿 exit code。测冷启延迟基线 + TCG 降级路径验证 | `echo hi`、`cargo --version` 三平台跑通；延迟数据落文档；WHPX 不可用的 Windows 上 TCG 路径可用 |
| **P1 执行核心** | OCI 镜像拉取与内容寻址缓存、Rust 侧 ext4 盘镜像生成、input layer 注入、guest overlayfs、规范化 tar diff、manifest/result 账本、`exec` RPC。网络先 off | 断网条件下"编译一个 crate"连跑 3 次 digest 全同；**同一 manifest 在 mac 和 linux 上 digest 相同** |
| **P2 录制与回放** | slirp→宿主 MITM 代理四档网络、CA 注入、net log 录制、`replay`/`verify` 动词、fs_diff 链式层 | `pip install requests && pytest` 在 mac 上 record，**在 Windows 上 replay 三次 digest 全同** |
| **P3 确定性收紧** | 时钟/熵 strict 模式、单 vCPU 档、三平台确定性标杆套件进 CI、分歧点定位报告 | 标杆套件三平台交叉全绿；故意引入 `date`/`$RANDOM` 的负载被正确标记 nondeterministic 并指出首个分歧 |
| **P4 性能** | VM 预热池、镜像层缓存策略、并发执行上限与排队；评估 QEMU snapshot（loadvm/migrate defer）做毫秒级恢复 | 预热命中时 exec 端到端 <100ms（硬件加速平台）；10 并发不互相污染 |
| **P5 接入 onething** | `createSandboxBashOperations` + `configureSandboxdHost` + Tier 路由配置 + 权限 UI 的 target 标记 + 三平台打包分发 | 真机：agent 在 sandbox 里跑测试，UI 正常流式显示，`verify` 通过；宿主档行为无回归 |

P0 的主要风险点从"libkrun 成熟度"变成了两个更小的：① Windows WHPX 在真实用户机器上的开启率（Hyper-V 平台被 VBS/第三方杀软影响）——TCG 兜底保证功能可用；② 裁剪 QEMU 的构建流水线（三平台交叉产物）——一次性投入，UTM/Lima 的构建脚本可参考。

## 7. 已决事项与坦白的边界

- **复现承诺以 guest 架构为界**（x86_64 / aarch64 各自成立）；跨架构精确 replay 走 uniform-arch（TCG 模拟）后门，慢，按需。
- **无硬件虚拟化的机器降级 TCG**：慢 5-10x，但真实与确定不打折——sandbox 没有"不可用"状态，只有快慢。
- **多线程负载的调度非确定性不承诺消除**，由 verify 检出并标记——这是行业现状（Bazel/Nix 同样不管你测试内部的竞态）。
- **HTTPS 之外的协议**（裸 TCP/UDP）P2 先只给 off/live 两档，录制回放后续按需加。
- **不引入 Docker/WSL2 依赖**；但吃 OCI 镜像生态（任何 OCI 镜像都能当 rootfs）。
- **QEMU GPLv2**：独立进程 + QMP 控制，不链接；随发行版附源码获取声明。
