# Bộ test endpoint

Hai bộ, khác nhau ở mục đích chứ không phải ở phạm vi:

| | `pnpm test:endpoints` | `pnpm probe:endpoints` |
| --- | --- | --- |
| Phạm vi | 14 public + 9 internal | 14 public + 2 nhóm bổ sung |
| Cần | `API_TOKEN` + `WORKER_TOKEN`, dừng worker | chỉ `API_TOKEN` |
| Đích mặc định | `localhost:3000` | đọc từ `new_setup/api-endpoint.md` |
| Trả lời | “có endpoint nào hỏng không?” | “endpoint trả về đúng cái gì, với điều kiện nào?” |
| Kết quả | bảng pass/fail | báo cáo ghi hình từng request kèm toàn bộ phản hồi |

Phần dưới nói về `test:endpoints`; `probe:endpoints` ở [cuối trang](#probe-đối-chiếu-api-đang-chạy-thật).

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

---

## Probe: đối chiếu API đang chạy thật

`pnpm test:endpoints` trả lời “có hỏng không”. Còn khi cần đưa cho người khác xem
— đối tác hỏi endpoint trả về cái gì, hay chính mình muốn biết vì sao một endpoint
được coi là đạt — thì `pnpm probe:endpoints` mới là thứ cần: nó **ghi hình** từng
lượt gọi và xuất ra một báo cáo tự đứng được, đọc mà không cần mở mã nguồn.

```bash
pnpm probe:endpoints                            # đọc đích ngay từ tài liệu
pnpm probe:endpoints -- --base=… --token=…      # chỉ định đích khác
pnpm probe:endpoints -- --no-downloads          # bỏ phần tải artifact về đĩa
pnpm probe:endpoints -- --keep-jobs             # giữ lại job probe tạo ra
```

### Đích test lấy từ tài liệu

Không có URL nào chép cứng trong mã. Probe đọc thẳng khối env đầu
`new_setup/api-endpoint.md`:

```env
BASE_URL=https://…/v1
API_TOKEN=apr_live_…
```

URL quick tunnel đổi mỗi lần server khởi động lại, nên chép vào mã là cầm chắc có
ngày chạy nhầm đích cũ mà vẫn thấy màu xanh. Thứ tự ưu tiên:
`--base=` / `--token=` → biến môi trường → tài liệu → `deploy/.env.api`.

### Kết quả

Ghi ra `work/endpoint-live/`:

| Tệp | Nội dung |
| --- | --- |
| `REPORT.md` | báo cáo chính — mỗi endpoint kèm mục tiêu, điều kiện tiên quyết, request nguyên văn, phản hồi đầy đủ, quy tắc tài liệu, và danh sách phép kiểm dẫn tới kết luận |
| `raw/` | thân phản hồi đầy đủ của **mọi** lượt gọi, kể cả thân lỗi và file nhị phân |
| `transcript.json` | toàn bộ request/response dạng máy đọc được |
| `summary.json` | kết quả rút gọn cho CI |
| `artifact/` | artifact tải về thật, tách theo `by-selector/` và `files/` |

Token và chữ ký bị che trong báo cáo; phần còn lại là nguyên văn.

### Hai nhóm ngoài 14 endpoint

* **E1** tải hết mọi selector và mọi file lẻ, băm lại từng file rồi so với
  `sha256` mà `/artifact/files` công bố — chứng minh byte tải về là byte thật,
  không chỉ là status code 200.
* **E2** thử gọi `/internal/v1/*` bằng token public. API nội bộ ghi thẳng vào
  artifact và đóng job được, nên phải chắc token phát cho đối tác không chạm tới.

### Điều kiện probe không tự dựng được

Nhóm artifact (P12–P14, E1) cần một job đã `completed` còn artifact. Một job thật
mất khoảng 60 giây trên emulator nên probe không tạo rồi chờ; nó dò trong số job
`completed` sẵn có và ghi rõ đã chọn job nào ở đầu báo cáo. Không có job nào phù
hợp thì bốn nhóm đó `SKIP` kèm lý do, không FAIL oan.

### Probe cũng làm thay đổi dữ liệu

Tạo 4 job (`POST /jobs` một, `POST /jobs/batch` hai, `POST /jobs/:id/cancel` một)
rồi huỷ hết ở bước dọn — trừ khi có cờ `--keep-jobs`. Không đụng tới job hay
artifact có sẵn: nhóm artifact chỉ đọc và tải.
