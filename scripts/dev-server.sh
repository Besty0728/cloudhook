#!/bin/bash
# CloudHook 前端开发服务器启动脚本

cd frontend

echo "🚀 启动 CloudHook 前端开发服务器..."
echo ""
echo "📍 本地访问地址: http://localhost:3000"
echo "🔌 API 代理: /api/* → http://localhost:8787"
echo ""
echo "按 Ctrl+C 停止服务器"
echo ""

npm run dev
