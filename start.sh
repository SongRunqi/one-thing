#!/bin/bash

# AI Chat Electron App - 启动脚本

set -e

echo "🚀 启动 AI Chat Electron 应用..."
echo ""

# 检查是否已安装依赖
if [ ! -d "node_modules" ]; then
    echo "📦 首次运行，安装依赖..."
    npm install
    echo ""
fi

# 杀死任何现有的进程
echo "🛑 清理旧进程..."
pkill -f "vite|electron" 2>/dev/null || true
sleep 1

# 启动 Vite 开发服务器
echo "⚡ 启动 Vite 开发服务器..."
npm run dev > /tmp/vite.log 2>&1 &
VITE_PID=$!

# 等待 Vite 启动
echo "⏳ 等待 Vite 就绪..."
sleep 3

# 检查 Vite 是否成功启动
if ! curl -s http://localhost:5173 > /dev/null 2>&1; then
    echo "❌ Vite 启动失败"
    cat /tmp/vite.log
    kill $VITE_PID 2>/dev/null || true
    exit 1
fi

echo "✅ Vite 已就绪"
echo ""

# 启动 Electron
echo "🖥️  启动 Electron 应用..."
npm run dev:electron

