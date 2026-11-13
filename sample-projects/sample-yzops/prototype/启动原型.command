#!/bin/bash
cd "$(dirname "$0")" || exit 1
PORT=8123
echo "正在启动本地服务：http://localhost:${PORT}/index.html"
python3 -m http.server ${PORT} >/dev/null 2>&1 &
SERVER_PID=$!
sleep 1
open "http://localhost:${PORT}/index.html"
echo "服务已启动（PID ${SERVER_PID}）。关闭此窗口或按 Ctrl+C 结束服务。"
wait ${SERVER_PID}
