#!/usr/bin/env bash
# 把某个 GitHub Release 的安装包镜像到腾讯云 COS,供国内用户高速下载。
# 前置:gh 已登录;coscli 已配置(见 docs/deploy/website-tencent-hk.md)。
# 用法:ONETHING_DL_BUCKET=onething-dl-1250000000 bash scripts/mirror-release.sh v1.1.6
set -euo pipefail

TAG="${1:?用法: mirror-release.sh <tag>,例如 v1.1.6}"
BUCKET="${ONETHING_DL_BUCKET:?请设置 ONETHING_DL_BUCKET,例如 onething-dl-1250000000}"
REGION="${ONETHING_COS_REGION:-ap-hongkong}"
REPO="SongRunqi/one-thing"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "从 GitHub 下载 $REPO@$TAG 的安装包..."
gh release download "$TAG" -R "$REPO" -D "$TMP" \
  -p '*.dmg' -p '*.zip' -p '*.exe' -p '*.AppImage' -p '*.deb'

echo "上传到 cos://$BUCKET/releases/$TAG/ ..."
coscli sync "$TMP/" "cos://$BUCKET/releases/$TAG/" \
  -e "cos.$REGION.myqcloud.com" --recursive --force

echo "完成。下载直链形如:"
echo "  https://<你的下载域名>/releases/$TAG/<文件名>"
echo "别忘了把 site/index.html 里 RELEASE.version 改成 ${TAG#v} 并重新部署网站。"
