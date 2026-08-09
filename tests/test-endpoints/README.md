# Bộ test endpoint

Kiểm tra toàn bộ endpoint mà `new_setup/api-endpoint.md` công bố: 14 public + 9 internal.

Không chỉ xem status code — mỗi endpoint còn được đối chiếu với những gì tài liệu hứa: shape của response, các trường bắt buộc, quy tắc chặn token, và những trường hợp phải bị từ chối (path traversal, chữ ký sai, tham số trùng, selector không hợp lệ).

## Chạy

```bash
# Đọc token từ deploy/.env.api, gọi vào localhost
pnpm test:endpoints

# Chỉ định đích khác
pnpm test:endpoints -- --base=https://api.example.com/v1 --token=apr_live_xxx

# Bỏ nhóm internal (khi chỉ có API_TOKEN)
pnpm test:endpoints -- --no-internal
```

| Tham số | Biến môi trường | Mặc định |
| --- | --- | --- |
| `--base=` | `BASE_URL` | `http://127.0.0.1:3000/v1` |
| `--internal=` | `INTERNAL_URL` | suy ra từ `--base` |
| `--token=` | `API_TOKEN` | đọc `deploy/.env.api` |
| `--worker-token=` | `WORKER_TOKEN` | đọc `deploy/.env.api` |
| `--out=` | `OUT_DIR` | `work/` |
| `--timeout=` | `TIMEOUT_MS` | `30000` |

Thoát mã `1` nếu có endpoint FAIL, `2` nếu bộ test chết giữa chừng — dùng được trong CI.

## Kết quả

Ghi ra `work/`:

* `endpoint-report.md` — bảng pass/fail từng endpoint, kèm phần chi tiết cho endpoint hỏng
* `endpoint-report.json` — dữ liệu thô, mỗi check một dòng

## Dừng worker trước khi chạy

Nhóm internal cần một job ở trạng thái `running` do chính nó sở hữu, mà cách duy nhất để có là gọi `claim`. Worker thật cũng poll cùng hàng đợi nên sẽ cướp job trước.

Bộ test có thử lại vài lượt và trả job về hàng đợi khi giành nhầm, nhưng chắc chắn nhất là dừng worker:

```bash
docker compose -f compose.yml -f compose.kvm.yaml -f compose.supabase.yaml stop worker
```

Không dừng thì 7 endpoint internal sẽ hiện `SKIP` kèm lý do, chứ không báo FAIL oan.

## Bộ test có làm thay đổi dữ liệu

Có, và đó là điều không tránh được: không thể kiểm tra `POST /jobs` mà không tạo job thật.

Những gì nó tạo ra rồi tự dọn:

* Vài job `com.zing.zalo` và `com.facemoji.lite` — đều bị huỷ ở bước cleanup
* Một worker tên `worker_endpoint_test` trong bảng `workers`
* Vài dòng `job_events` kiểu `endpoint.test`
* Một artifact nhỏ của job test, hết hạn theo `ARTIFACT_TTL_HOURS` như mọi artifact khác

Không chạy trên môi trường có dữ liệu quan trọng nếu không muốn mấy thứ trên xuất hiện.
