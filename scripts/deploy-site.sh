#!/usr/bin/env bash
# 把 site/ 部署到腾讯云 COS 静态网站托管。
# 前置:安装并配置 coscli(https://github.com/tencentyun/coscli),
#       见 docs/deploy/website-tencent-hk.md。
# 用法:ONETHING_SITE_BUCKET=onething-site-1250000000 bash scripts/deploy-site.sh
set -euo pipefail

BUCKET="${ONETHING_SITE_BUCKET:?请设置 ONETHING_SITE_BUCKET,例如 onething-site-1250000000}"
REGION="${ONETHING_COS_REGION:-ap-hongkong}"
SITE_DIR="$(cd "$(dirname "$0")/../site" && pwd)"

echo "上传 $SITE_DIR -> cos://$BUCKET ($REGION)"
coscli sync "$SITE_DIR/" "cos://$BUCKET/" -e "cos.$REGION.myqcloud.com" --recursive --delete --force

echo "完成。如果配了 CDN,记得刷新缓存:"
echo "  控制台 CDN -> 缓存刷新 -> 刷新目录 https://你的域名/"
