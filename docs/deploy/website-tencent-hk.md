# onething 官网部署手册(腾讯云香港 · 免备案)

目标:`site/index.html` 部署到腾讯云 COS(香港区)+ CDN,绑定自有域名,
安装包镜像到 COS 供国内高速下载。全程不需要 ICP 备案(资源都在香港区,
CDN 使用「境外加速」)。

整体结构:

```
你的域名(如 onething.example)
├── www.域名 / 裸域名  → CDN(境外加速) → COS 网站桶(site/ 静态页)
└── dl.域名            → CDN(境外加速) → COS 下载桶(releases/vX.Y.Z/安装包)
```

网站桶和下载桶可以合成一个,分开的好处是下载流量大时便于单独限速/统计。

## 0. 前置

- 腾讯云账号 + 实名认证(买域名必须实名,即使不备案)。
- 本机安装:
  - `gh`(已装)
  - `coscli`:从 https://github.com/tencentyun/coscli/releases 下载对应平台
    二进制,`chmod +x` 后放入 PATH;运行 `coscli config init`,
    填 SecretId/SecretKey(控制台 → 访问管理 CAM → API 密钥管理)。

## 1. 买域名

1. 控制台 → 域名注册,搜索心仪域名(.com 首年约 ¥60-70;.dev/.app 等
   新后缀也可,注意 .app 强制 HTTPS)。
2. 购买时完成域名实名认证(个人身份证,通常几小时内通过)。
3. **不需要备案**——只要解析目标是香港/境外资源。切勿把它解析到大陆
   IP,否则会被阻断。

## 2. 建 COS 存储桶(香港区)

控制台 → 对象存储 COS → 创建存储桶:

| 项 | 值 |
|---|---|
| 名称 | `onething-site`(实际会带 APPID 后缀,如 `onething-site-1250000000`) |
| 地域 | **中国香港 ap-hongkong** |
| 访问权限 | 公有读、私有写 |

然后在桶设置里:

1. 基础配置 → **静态网站** → 开启,索引文档 `index.html`。
2. 若建了第二个下载桶(`onething-dl`),同样公有读,不用开静态网站。

## 3. CDN + 自定义域名 + HTTPS

1. 控制台 → 内容分发网络 CDN → 添加域名:
   - 加速域名:`www.你的域名`(网站)/ `dl.你的域名`(下载)
   - **加速区域:境外**(选「中国境外」即可免备案;选「全球」会要求备案)
   - 源站类型:对象存储 COS,选对应桶;网站桶建议源站选
     「静态网站源站」(`...cos-website.ap-hongkong...`),这样 404/索引行为正确。
2. 证书:控制台 → SSL 证书 → 申请免费证书(DNSPod 域名一键验证),
   然后在 CDN 域名的 HTTPS 配置里绑定,开启「强制 HTTPS 跳转」。
3. DNS:域名解析 DNSPod → 添加记录:
   - `www` / `dl` → CNAME → CDN 分配的 `*.cdn.dnsv1.com` 地址
   - 裸域名可加一条「显性 URL 转发」到 `https://www.你的域名`。

> 简化选项:如果暂时不想配 CDN,可以直接 CNAME 到 COS 静态网站域名,
> 也能用,但自定义域名上 HTTPS 证书必须走 CDN,所以正式上线建议按上面配。

## 4. 部署网站

```bash
ONETHING_SITE_BUCKET=onething-site-1250000000 bash scripts/deploy-site.sh
```

改版后重跑同一条命令,再到 CDN 控制台刷新目录缓存。

## 5. 镜像安装包

发版(GitHub Release 发布后)执行:

```bash
ONETHING_DL_BUCKET=onething-dl-1250000000 bash scripts/mirror-release.sh v1.1.6
```

然后编辑 `site/index.html` 顶部的 `RELEASE` 配置:

```js
const RELEASE = {
  version: "1.1.6",
  cosBase: "https://dl.你的域名/releases",  // 换掉占位的 example.com
  ...
};
```

重新执行第 4 步部署。`cosBase` 保持占位值时页面会自动回退 GitHub 直链,
所以网站可以先上线、镜像后补。

## 6. 上线检查清单

- [ ] GitHub Release 从 Draft 改为正式发布(目前 v1.1.2–v1.1.6 都是 Draft,
      用户点 GitHub 链接看不到):`gh release edit v1.1.6 --draft=false`
- [ ] `site/index.html` 的 `RELEASE.version` / `cosBase` 已更新
- [ ] 三个平台的下载直链各点一次,能下、文件大小正常
- [ ] 手机(蜂窝网络)访问一次网站,确认国内可达、速度可接受
- [ ] HTTPS 强制跳转生效

## 7. 费用预估(个人规模)

| 项 | 费用 |
|---|---|
| 域名 .com | 约 ¥60-70/年 |
| COS 存储(几 GB 安装包) | 约 ¥0.1/GB/月 |
| CDN 境外流量 | 约 ¥0.3-0.5/GB(下载 200MB 安装包一次约 ¥0.1) |
| 网站本身流量 | 忽略不计 |

建议在「费用中心 → 预算管理」设一个月度预算告警(比如 ¥50),
防止下载流量被刷。COS 桶里也可开「防盗链」,Referer 白名单填你的域名 + 空 Referer。
