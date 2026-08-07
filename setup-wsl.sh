#!/bin/bash
set -e

echo "=========================================="
echo "🚀 TỰ ĐỘNG TRIỂN KHAI APP-RELAY TRÊN WSL"
echo "=========================================="

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "📂 Thư mục hiện tại: $(pwd)"

echo "📦 Kiểm tra & cài đặt Docker trên Ubuntu WSL..."
sudo apt-get update -y
sudo apt-get install -y curl docker.io docker-compose-v2

if ! service docker status >/dev/null 2>&1; then
    echo "⚡ Khởi động dịch vụ Docker..."
    sudo service docker start || true
fi

if ! groups $USER | grep &>/dev/null '\bdocker\b'; then
    sudo usermod -aG docker $USER || true
fi

echo "🐳 Đang build và chạy Docker Containers (Dashboard + Worker)..."
sudo docker compose up -d --build

echo "⏳ Đợi ứng dụng khởi chạy (5s)..."
sleep 5

echo "🔍 Kiểm tra trạng thái API Health Check..."
HEALTH_CHECK=$(curl -s http://localhost:3001/api/app-relay/v1/health || echo "FAILED")

echo "=========================================="
if [[ "$HEALTH_CHECK" == *"ok"* ]]; then
    echo "✅ TRIỂN KHAI THÀNH CÔNG RỒI NHÉ!"
    echo "🌐 Base URL: http://localhost:3001/api/app-relay/v1"
    echo "🔑 Token: dev-worker-token-secret-key"
    echo "=========================================="
    echo "💡 Bạn có thể chạy ngay lệnh sau để xem thông tin:"
    echo 'curl http://localhost:3001/api/app-relay/v1/overview -H "Authorization: Bearer dev-worker-token-secret-key"'
else
    echo "⚠️ Đã chạy lệnh triển khai. Danh sách container đang chạy:"
    sudo docker compose ps
fi
