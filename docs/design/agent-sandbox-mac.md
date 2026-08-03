# Agent Sandbox —— macOS 实施设计

日期：2026-08-03
状态：方案（未实施）
上位文档：[agent-sandbox-rust.md](./agent-sandbox-rust.md)（跨平台总架构）
本篇范围：**macOS 单平台的完整落地设计**（Apple Silicon + Intel 双架构）

---

## 0. 本篇的定位：先做 mac，但不许做成 mac-only

总架构定了目标是三平台。先做 mac 有两种做法，差别是后面要不要推倒重来：

- **做法 A（否决）**：用 Virtualization.framework 写一个 mac 原生实现。启动快、有 vsock/virtiofs/Rosetta，写起来舒服。代价是——它是 mac 独占 API，Windows/Linux 时整条执行层要重写；更要命的是**设备面不一样**（vsock vs 串口、virtiofs vs 块设备），guest 里看到的 `/proc`、挂载表、设备节点都不同，"mac 上录、Windows 上放，digest 相同"这个核心承诺**不可能由构造保证**，只能靠事后碰运气。
- **做法 B（采用）**：用**捆绑 QEMU + HVF 加速**。就是总架构里那条三平台通吃的路，只是先只编译/签名/调通 mac 这一份产物。Windows/Linux 时**换的只是加速器参数**（`accel=hvf` → `whpx`/`kvm`）和二进制分发，guest 侧、协议侧、账本侧一行不改。

所以本篇是"总架构的 mac 切片"，不是"mac 专用方案"。P0–P5 的每一项交付都要求：**guest 侧与协议侧的代码不得包含任何 `#[cfg(target_os = "macos")]`**，平台差异只允许出现在 `QemuBackend` 的参数拼装和打包脚本里。这条纪律用 CI lint 守（见 §9）。

Virtualization.framework 不是永久出局：它可以在很后面作为**可选加速后端**回来，但准入门槛是——必须通过与 QEMU 后端同一套确定性套件，且与 QEMU 后端产出的 digest 逐字节一致。做不到就只能服务于非 strict 档。这个坑留在 `trait Vmm` 后面，不占用主线。

---

## 1. mac 上的技术栈定版

| 层 | 选择 | mac 特有说明 |
| --- | --- | --- |
| 加速器 | **HVF**（Hypervisor.framework） | Apple Silicon 与 Intel 都支持；现代 mac 无一例外可用，所以 **mac 上 TCG 不是兜底而是特殊用途**（见 §6.3） |
| VMM | 捆绑 `qemu-system-aarch64` / `qemu-system-x86_64` | 按宿主架构装一份；跨架构模拟另说 |
| 机型 | ARM: `virt`，Intel: `q35` | `microvm` 机型是 x86 独占，双架构一致性优先，不用它 |
| 引导 | **直接内核引导**（`-kernel` + `-initrd` + `-append`） | 跳过 EDK2/BIOS，省掉 300ms+ 和一整个固件依赖 |
| 控制面 | QMP over unix socket | 生命周期、快照、资源查询 |
| 数据面 | virtio-serial（控制+流式输出）+ virtio-blk（批量进出） | **不用 vsock、不用 virtio-fs**——见 §3 |
| 网络 | slirp 用户态（`-netdev user,restrict=on`）→ 宿主 MITM 代理 | 无需 TAP/管理员权限/网络扩展，不触发 macOS 防火墙弹窗 |
| 宿主 RPC | unix socket + NDJSON，`<store>/sandbox/run/sandboxd.sock` | 与现有 CLI daemon 同风格 |

产物形态：`native/sandboxd/` 一个 Cargo workspace，三个 crate——`sandboxd`（宿主守护）、`sandbox-guest-init`（guest PID 1，musl 静态）、`sandbox-proto`（共享协议类型）。

---

## 2. mac 上最硬的一段：签名、entitlement、公证

这是 mac 独有、且**必须最先验证**的部分——它能一票否决整个方案，所以排在 P0 而不是打包期。

### 2.1 HVF 需要 entitlement

调用 Hypervisor.framework 的进程必须带 `com.apple.security.hypervisor` entitlement，否则 `hv_vm_create` 直接失败。注意这是**加在 qemu 二进制上**，不是加在 Electron 主进程上——entitlement 是按二进制走的，我们 spawn 出去的 qemu 是独立进程，得自己带。

```xml
<!-- native/sandboxd/entitlements/qemu.plist -->
<key>com.apple.security.hypervisor</key><true/>
<!-- 仅 uniform-arch（TCG 跨架构模拟）需要：TCG 是 JIT -->
<key>com.apple.security.cs.allow-jit</key><true/>
```

**当前仓库的现状是有利的**：`scripts/lib/macos-dev-signing.mjs` 走的是 ad-hoc 签名（`codesign --force --deep --sign -`）。ad-hoc 签名**是可以携带 entitlement 的**，本机 HVF 认这个。也就是说**开发链路不需要付费证书就能跑通**，P0 可以零成本验证。要做的只是给 qemu 及其 dylib 单独一条签名规则（不能被 `--deep` 顺手覆盖掉 entitlement——`--deep` 会重签子二进制并丢掉它们各自的 entitlement，这是经典坑）。

### 2.2 分发链路要补的东西

`electron-builder.yml` 现在 `mac:` 段只有 `extendInfo` 和 target，**没有 `hardenedRuntime` 显式声明、没有 `entitlements`、没有 `notarize`**。而 electron-builder 26.x 默认 `hardenedRuntime: true`。要发布带 sandbox 的版本，需要补齐：

1. 主 app 的 entitlements plist（Electron 常规那套）+ qemu 的独立 entitlements；
2. `mac.binaries` 列出需要单独签名的可执行文件与 dylib（或写 `afterSign` hook 精确控制顺序）；
3. **签名顺序**：先签最深的 dylib → 再签 qemu → 再签 app bundle。用 `--deep` 一把梭必然丢 entitlement；
4. **库校验**：捆绑的 dylib（glib、pixman、libslirp…）全部用同一 Team ID 签，就不需要 `com.apple.security.cs.disable-library-validation`——**宁可多签几个文件也不要开这个洞**；
5. Developer ID 证书 + 公证（notarytool）：目前仓库没有这条链路，是新增工作量；
6. **与 castlabs EVS 的顺序冲突**：本仓库用 castlabs electron（`41.1.1+wvcus`）跑 Widevine，EVS 的 VMP 签名对 bundle 有自己的顺序要求。qemu 的签名必须插在 EVS 之前还是之后，**P0 就要在真机上试出来并写进脚本**，不能拖到发版前一天才发现互踩。

### 2.3 Gatekeeper 与下载物

guest 内核和基础 rootfs 是**数据文件不是可执行文件**，不受 Gatekeeper 约束，首次运行时下载（带 digest 校验）即可，不进安装包。这一点让安装包只需要背 qemu（裁剪后压缩约 15–30MB/架构）。

---

## 3. 数据通路：为什么 mac 上不用 vsock 和 virtio-fs

mac 宿主上这两个都拿不到——`vhost-vsock` 与 `virtiofsd` 都是 Linux 宿主内核/用户态的东西，QEMU 在 mac 上给不了。这反而是好事：被迫选的替代方案恰好就是三平台通用的那个。

**批量数据走"tar 直接当块设备"**——这是本设计里最省事的一招，宿主侧完全不需要任何 Linux 文件系统写入能力（mac 上既没有 `mkfs.ext4` 也没有 overlayfs）：

| 用途 | 设备 | 做法 |
| --- | --- | --- |
| 基础 rootfs | `/dev/vda` 只读 | 我们在 CI 里预构建、digest 钉死的 erofs/ext4 镜像 |
| 输入工作区 | `/dev/vdb` 只读 | **宿主直接把 tar 文件当 raw 块设备挂进去**，guest `tar -xf /dev/vdb`。不需要文件系统 |
| 输出 diff | `/dev/vdc` 读写 | 宿主给一个预分配的空 raw 文件，guest 把规范化 tar（排序、mtime 归一、uid/gid 归一）写进去，长度经控制通道回报 |
| 可写层 | tmpfs（默认）/ `/dev/vdd` | overlayfs upperdir；大工作负载用 scratch 盘，**由 guest 自己 `mkfs`** |

**控制与流式输出走 virtio-serial**：`ctl` 端口跑 NDJSON 控制协议，`io` 端口跑 stdout/stderr 的时间线流（延迟敏感、数据量小）。批量数据不走串口，避免吞吐瓶颈。

**推论——镜像构建也在 VM 里做**：OCI layer → 磁盘镜像的转换需要 Linux 工具链，宿主没有。那就用 sandbox 自己当构建器：起一个 builder VM，把 OCI layer 喂进去，让 guest 组装出磁盘镜像写到输出盘。宿主侧零 Linux 文件系统代码。引导问题（第一个镜像哪来的）由我们在 CI 预构建基础镜像解决。

---

## 4. 启动路径与延迟预算

```
ARM:   qemu-system-aarch64 -M virt,accel=hvf,gic-version=3 -cpu host \
         -kernel Image -initrd init.cpio -append "console=hvc0 …" -nographic
Intel: qemu-system-x86_64  -M q35,accel=hvf -cpu host \
         -kernel bzImage -initrd init.cpio -append "console=ttyS0 …" -nographic
```

延迟预算（**P0 必须实测填数，下表是目标不是承诺**）：

| 阶段 | 目标 |
| --- | --- |
| qemu 进程启动 + HVF 初始化 | < 150ms |
| 内核引导到 init | < 250ms（极简 initramfs、关掉不需要的驱动探测） |
| init 挂载 overlay + 就绪 | < 100ms |
| **冷启合计** | **< 1s** |
| **预热池命中** | **< 100ms**（P4） |

预热池：常驻 N 个已启动到 init 就绪、尚未挂载输入盘的 VM。执行到来时热插输入盘（QMP `blockdev-add` + `device_add`）→ 发命令。**关键约束（P0 实测）**：Apple Silicon 上 HVF 的并发 VM 数量上限、以及每 VM 的常驻内存开销——这两个数直接决定池子多大，mac 用户机器 RAM 有限，不能拍脑袋。

---

## 5. 网络：slirp + 宿主代理，mac 上的额外好处

`-netdev user,restrict=on` + `guestfwd` 指向宿主代理。`restrict=on` 让 guest **在拓扑上就无法访问除代理外的任何地址**——网络管控不靠 iptables 规则，靠"根本没有别的出口"。

mac 特有的三个好处：

1. **不需要管理员权限**（TAP/bridge 在 mac 上要装内核扩展或 Network Extension，用户会看到吓人的授权弹窗）；
2. **不触发 macOS 应用防火墙弹窗**——只要宿主代理绑定 `127.0.0.1` 而非 `0.0.0.0`（绑通配地址会让 macOS 弹"是否允许接受传入连接"，且每次重签名后重弹）；
3. 不与用户的 VPN/企业网络管控打架（slirp 走宿主的常规 socket，继承宿主路由）。

代理四档：`off`（默认，`-netdev` 干脆不给）/ `record` / `replay` / `live`。CA 证书预置进基础 rootfs。

---

## 6. mac 上的确定性

### 6.1 时钟

`-rtc base=<manifest.epoch>,clock=vm`。`clock=vm` 让 RTC 随虚拟 CPU 时间推进而不是宿主挂钟——这是让"同 manifest 两次执行时间读数一致"的关键，且 HVF 下可用。单调钟由 guest init 在启动时归零。

### 6.2 熵

三道：manifest seed 喂 guest 熵池 → 内核 `random.trust_cpu=off` → `-cpu` 屏蔽硬件 RNG 指令（x86 的 `-rdrand`/`-rdseed`，ARM 的 `RNDR`）。**第三道在 HVF 下未必能屏蔽干净**（HVF 对 CPU feature 的可控性不如 KVM），P3 必须实测：写一个直接调 `RDRAND`/`RNDR` 的探针程序，跑两次比对。屏蔽不掉就退到 `LD_PRELOAD` interpose 兜底，并在文档里如实标注"静态链接且直接用硬件 RNG 指令的程序不保证确定"。

### 6.3 mac 上 TCG 的定位

现代 mac 全都有 HVF，所以 TCG 在 mac 上**不是可用性兜底，而是两个特殊用途**：

- **uniform-arch**：Apple Silicon 上模拟 x86_64 guest，用于复现 x86 机器上录的执行。慢（5–10x），按需。需要 `allow-jit` entitlement。
- **法证档**：TCG 的 `icount` + record/replay 提供指令级确定重放。不做主线，但给"这次执行必须逐指令复现"留了后门。

注意 **Rosetta 不在选项内**：VM 里用 Rosetta 跑 x86 二进制是 Virtualization.framework 独占能力，QEMU 拿不到。这是选 QEMU 的真实代价，如实记下。

---

## 7. 存储布局

```
~/.onething/sandbox/
├── qemu/                 # 捆绑二进制的运行时解包位（或直接指向 app bundle 内）
├── kernel/<digest>/      # guest 内核 + initramfs，首次下载
├── images/<digest>/      # 基础 rootfs 磁盘镜像
├── cas/<bl3-prefix>/     # 内容寻址：input tar / output tar / stdout / stderr / net log
├── exec/<execution-id>/  # manifest.json + result.json（软引用 cas）
└── run/                  # sandboxd.sock、每 VM 的 qmp/serial socket、pid
```

沿用 `getOnethingStorePath()` 体系，不硬编码路径（与仓库既有纪律一致）。`StoreLock.acquire('sandboxd')` 防多开。

---

## 8. 与 onething 的接入（mac 侧具体到文件）

- **执行接口**：`packages/onething-runtime/src/tools/bash-executor.ts` 已有 `BashOperations` 抽象（现由 `createLocalBashOperations` 用 `node:child_process` 实现）。新增 `createSandboxBashOperations`，同接口、内部走 sandboxd RPC，stdout/stderr 流式回传，Tier 路由在这一层。**工具层协议与权限链路一行不改。**
- **装配端口**：`packages/onething-runtime/src/app/` 新增 `configureSandboxdHost`，与既有七个 `configure*Host` 同款式样；Electron 主进程在 `apps/electron/src/app/main-process.ts` 注入 socket 路径与进程生命周期，`createOnethingBackend` 的 `afterTools` hook 完成 wiring。
- **别名登记**：新增的 runtime 子路径要在 `onething.aliases.ts` 登记（漏了只在运行时炸、typecheck 不报——仓库既有的已知陷阱）。
- **权限 UI**：permission ask 增加一个信息位 `target: host | sandbox`。sandbox 目标因为隔离，可配更宽的自动放行策略——这是 sandbox 对产品体验的直接回报（agent 少问几次）。
- **打包**：qemu 与 sandboxd 二进制放 `resources/native/`（该目录已由 `extraResources` 映射到 `Resources/native`，`macos_panel.node` 已在用），另加 §2.2 的签名规则。

---

## 9. 跨平台纪律的自动守护

先做 mac 最大的风险是**不知不觉写成 mac-only**。三条 CI 断言：

1. `sandbox-guest-init` 与 `sandbox-proto` 两个 crate **不得出现任何 `cfg(target_os)`**（grep 断言）；
2. `sandboxd` 里 `cfg(target_os)` 只允许出现在白名单文件（`vmm/qemu/args.rs`、`ipc/transport.rs`、`paths.rs`）——超出白名单即 fail，与仓库既有的 `boundary:gate` 棘轮同思路；
3. 确定性标杆套件的 manifest 与期望 digest **入库**，Windows/Linux 后续接入时直接拿这套 digest 当验收，不重新定义标准。

---

## 10. 分期（mac）

| 期 | 交付 | 验收（真机 M 系 + Intel 各一台） |
| --- | --- | --- |
| **P0 尖刺** | 用 homebrew 的 qemu 先跑通链路（不先纠结自建）：直接内核引导 → guest init 经 virtio-serial 握手 → 收命令 → 流式回传 → exit code。**同期验证 entitlement**：ad-hoc 签名带 `com.apple.security.hypervisor` 能否起 HVF；`--deep` 丢 entitlement 的坑复现并绕过；试出与 castlabs EVS 的签名顺序 | `echo hi` 与 `cargo --version` 跑通；冷启延迟、并发 VM 上限、每 VM 常驻内存三个数落文档；签名顺序写进脚本 |
| **P1 执行核心** | 自建裁剪 qemu（双架构）+ dylib 捆绑与 rpath 修复 + 逐个签名；tar-as-block-device 进出；guest overlayfs；规范化 tar diff；manifest/result 账本；`exec` RPC。网络先 off | 断网下"编译一个 crate"连跑 3 次 digest 全同；app bundle 内的 qemu 能起 HVF（不是 homebrew 那个） |
| **P2 录制回放** | slirp + 宿主 MITM 代理四档；CA 注入；net log；`replay`/`verify` 动词；fs_diff 链式层 | `pip install requests && pytest` record 一次、replay 三次 digest 全同；确认无防火墙弹窗 |
| **P3 确定性收紧** | 时钟/熵 strict；单 vCPU 档；硬件 RNG 屏蔽实测与兜底；标杆套件 + 分歧点定位报告 | 标杆套件全绿；`date`/`$RANDOM`/`RDRAND` 探针被正确标记 nondeterministic 并指出首个分歧点 |
| **P4 性能** | VM 预热池 + 热插盘；镜像层缓存；并发上限与排队；评估 QMP 快照恢复 | 预热命中 exec 端到端 < 100ms；并发跑满不互相污染；内存占用在设定上限内 |
| **P5 接入与分发** | `createSandboxBashOperations` + `configureSandboxdHost` + Tier 路由 + 权限 UI target 位；`electron-builder.yml` 补 hardenedRuntime/entitlements/binaries/notarize；Developer ID + 公证链路 | 真机：agent 在 sandbox 里跑测试、UI 流式正常、`verify` 通过；**公证过的 dmg 装到干净机器上 sandbox 可用**；宿主档（Tier C）行为无回归 |

P0 是唯一可能翻车的一期，且翻车点全在签名与 entitlement 上（HVF 本身很成熟）。所以 P0 把"能不能签得动"和"能不能跑得起来"绑在一起验，不接受先跑通再补签名。

---

## 11. mac 特有风险与对策

| 风险 | 对策 |
| --- | --- |
| `--deep` 重签丢掉 qemu 的 entitlement | 分层显式签名，禁用 `--deep`；CI 加 `codesign -d --entitlements` 断言 |
| castlabs EVS 与 qemu 签名互踩 | P0 就试顺序并固化进脚本；最坏情况把 qemu 移出 bundle 改用户目录（牺牲一点分发整洁度） |
| Apple Silicon 并发 VM / 内存上限压制预热池 | P0 实测取数，池大小按可用 RAM 动态定；单 VM 内存默认从 2GB 下调并用 virtio-balloon |
| HVF 下屏蔽不掉硬件 RNG 指令 | LD_PRELOAD 兜底 + 如实标注边界（见 §6.2） |
| 裁剪 qemu 的双架构构建流水线成本 | P0 用 homebrew qemu 解耦风险，自建推到 P1；可参考 UTM/Lima 的构建脚本 |
| macOS 大版本升级后 HVF 行为变化 | 标杆套件常驻 CI；qemu 版本digest 钉死，升级走灰度 |
| 无 Rosetta，x86 guest 只能 TCG | 如实标注；uniform-arch 定位为按需慢档，不进热路径 |

---

## 12. 与上位文档的差异（已回写）

本篇在 mac 具体化过程中修正了总架构的两处：

1. **取消宿主侧 Rust ext4 写入器**——改为 tar-as-block-device + 镜像构建在 VM 内完成。宿主零 Linux 文件系统代码，三平台同样受益。
2. **明确 TCG 在 mac 上不是可用性兜底**（mac 全有 HVF），只服务 uniform-arch 与法证档；TCG 兜底的价值集中在 Windows（WHPX 可能被关）。
