#!/bin/bash
# Chạy toàn bộ migration theo thứ tự tên file.
#
# Trước đây compose mount cứng 001_initial_schema.sql vào initdb, nên deploy
# sạch chỉ có schema của migration đầu tiên — mọi migration sau đó im lặng bị
# bỏ qua và API chết khi đụng cột mới. Lặp qua cả thư mục thì thêm migration
# không phải sửa compose nữa.
set -euo pipefail

shopt -s nullglob
for f in /migrations/*.sql; do
  echo "[init] áp dụng $(basename "$f")"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$f"
done
