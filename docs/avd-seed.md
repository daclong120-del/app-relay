# Seed AVD — phiên đăng nhập Google Play sống sót qua deploy

**Chủ sở hữu duy nhất** của mọi thứ liên quan tới seed AVD, worker image và cờ
`--no-build`. Trước đây năm thứ này nằm rải ở `docker.md`, `deploy-vps.md`,
`emu-gui-workflow.md` và `deploy/README.md`, mỗi chỗ một nửa — file nào cần thì
trỏ về đây.

Đây là tài sản mong manh nhất của hệ thống: mất nó thì phải ngồi đăng nhập CH
Play bằng tay qua noVNC, và trên VPS thì không ai làm hộ.

---

## 1. Sự thật lõi, ba dòng

- **Phiên đăng nhập Google Play nằm trong volume `worker-avd`.** Volume không đi
  theo image, nên deploy sang máy mới mặc định là **mất** phiên.
- **Seed là cách vác phiên đó theo image.** Chụp AVD đã đăng nhập thành một
  tarball, nướng vào worker image lúc build, máy mới bung ra thay vì tạo AVD trắng.
- **Vì vậy worker image chỉ được build ở máy đang giữ `avd-seed/`.** Mọi máy khác
  phải `pull`, không bao giờ `build`.

---

## 2. Seed nằm ở đâu

| | Đường dẫn | Ghi chú |
|---|---|---|
| Trên máy giữ seed | `avd-seed/avd-seed.tar.gz` ở **gốc repo** | ~2.4–2.5 GB. `.gitignore` chặn (`/avd-seed/*`, chỉ chừa `.gitkeep`) |
| Trong image | `/opt/avd-seed/avd-seed.tar.gz` | [Dockerfile:130](../apps/worker/Dockerfile) `COPY avd-seed/ /opt/avd-seed/` — COPY cả **thư mục**, không phải file, để build không fail khi chưa có seed |
| Đổi đường dẫn | `AVD_SEED_PATH` | Mặc định như trên, xem [create-avd.sh:15](../apps/worker/docker/create-avd.sh) |
| Bỏ qua seed | `AVD_SEED_DISABLE=1` trong `.env.worker` | Tạo AVD trắng — dùng khi đổi tài khoản hoặc nghi seed hỏng |

---

## 3. Tạo seed

Chạy trên máy **đã đăng nhập** CH Play. Script tự tắt emulator sạch rồi bật lại:

```bash
cd deploy
./capture-avd-seed.sh          # → avd-seed/avd-seed.tar.gz
```

Hai thứ script cố ý **lọc ra khỏi** seed:

- `sdcard.img` — 13 GB toàn số 0, mà phiên đăng nhập không nằm trên đó
  (`sdcard.img.qcow2` chỉ ~580 KB, tức gần như chưa ghi gì).
  [create-avd.sh](../apps/worker/docker/create-avd.sh) dựng lại nó ở máy đích
  bằng `mksdcard` theo `AVD_SDCARD_SIZE`.
- `${AVD_HOME}/running` — sổ đăng ký emulator đang chạy của máy cũ.

Và một thứ script cố ý **mang theo**: `adbkey`. Thiếu nó thì §7 giải thích hậu quả.

---

## 4. Nướng vào image rồi push

```bash
docker compose build worker
docker compose push worker
```

> **Repo Docker Hub phải để PRIVATE.** Image này chứa phiên đăng nhập Google —
> ai `pull` được là vào được tài khoản đó. Cạm bẫy "push vào repo chưa tồn tại
> thì Docker Hub tự tạo nó PUBLIC" ở [docker.md §8](docker.md).

Lần build đầu ~30 phút (tải Android SDK + system image). Build lại sau khi chỉ
sửa code worker mất **2–3 phút** — Docker còn cache toàn bộ layer `apt-get` và
Android SDK, chỉ layer `COPY` + `pnpm build` chạy lại.

Seed làm image to lên bao nhiêu, đo sau khi build thật:

| | Trước seed | Sau seed |
|---|---|---|
| Phải push/pull qua registry | 2.97 GB | **5.51 GB** |
| Chiếm trên đĩa máy local | 7.95 GB | 13 GB |

Hai con số chênh nhau vì containerd giữ cả blob nén lẫn bản đã bung. Cái quyết
định thời gian `push`/`pull` là **dòng trên**, không phải cột đầu của
`docker images`.

> Đừng mất thời gian nén seed. 2.4 GB gần như toàn bộ là
> `userdata-qemu.img.qcow2`; Android mã hoá partition đó (FBE) nên dữ liệu đã
> ngẫu nhiên. Đo thật: 300 MB → 310 MB, gzip làm *phình*.

---

## 5. Máy đích: chỉ `pull`, và `--no-build` là bắt buộc

```bash
docker login                            # image private, không login là pull denied
./bootstrap.sh --http-only --no-build
```

`bootstrap.sh` **mặc định** chạy `docker compose build`
([bootstrap.sh:386](../deploy/bootstrap.sh)). Trên máy đích điều đó hỏng đúng thứ
cần giữ:

- Máy đích chỉ nhận `deploy/` + `supabase/migrations/` qua `scp` — **không có
  `avd-seed/`** ở đó (và cũng không thể có: `.gitignore` chặn khỏi git).
- Build ở đó ra image **không seed**. `create-avd.sh` rơi về nhánh tạo AVD trắng.
- **Không có lỗi nào báo ra.** Triệu chứng duy nhất là Play Store hiện màn hình
  đăng nhập như máy mới tinh.
- Cộng thêm ~30 phút build trên chính con máy đang phải chạy emulator.

`--no-build` không phải tuỳ chọn cho nhanh. Nó là điều kiện đúng đắn.

Máy đích thấy seed thì `create-avd.sh` bung ra và in
`Bung seed xong — phiên đăng nhập Google Play giữ nguyên`, Play Store vào thẳng
không hỏi mật khẩu.

---

## 6. Vì sao CI không build worker

Job build worker đã **bị gỡ hẳn** khỏi [ci.yml](../.github/workflows/ci.yml).
Lý do là hệ quả trực tiếp của §5: CI checkout từ git, mà seed bị `.gitignore`
chặn, nên runner **không bao giờ** có file đó. Image CI tạo ra vẫn chạy — chỉ là
mất phiên đăng nhập, và đẩy lên tag `latest` là ghi đè mất bản đang dùng thật.

Hệ quả phải sống với:

| | |
|---|---|
| Sửa code trong `apps/worker/` | Build + push **tay** từ máy giữ seed (§4), CI không làm |
| Deploy báo xanh mà VPS không đổi gì | Đúng như thiết kế — pipeline chỉ build image **API** |
| Rollback worker | Không có tag `<git sha>` như API. Muốn lùi được thì **tự gắn tag ngày tháng** lúc push |

Pipeline 4 job và các khoảng trống khác: [CI-CD.md](CI-CD.md).

---

## 7. Bốn chế độ hỏng, tất cả đều im lặng hoặc khó đoán

| Triệu chứng | Nguyên nhân | Xử lý |
|---|---|---|
| Play Store hỏi đăng nhập như máy mới | Image không có seed — gần như luôn là quên `--no-build` ở máy đích | Build ở máy giữ seed rồi `push`; máy đích chỉ `pull` |
| Container worker `exit 1` ngay, log `seed không chứa AVD tên '<x>'` | `ANDROID_AVD` đổi giữa lúc chụp seed và lúc deploy | Sửa `ANDROID_AVD` trong `.env.worker` cho khớp, hoặc `AVD_SEED_DISABLE=1` rồi đăng nhập lại. **Đây là fail-fast có chủ đích** — im lặng bỏ qua thì máy vẫn chạy mà mất sạch phiên |
| Emulator lên, Android lên, nhưng **mọi** lệnh adb trả `device unauthorized` | Seed thiếu `adbkey`; `/data/misc/adb/adb_keys` trong seed chỉ chấp nhận khoá của máy cũ | Chụp lại seed bằng bản `capture-avd-seed.sh` mới (nó lấy kèm `adbkey`). Log có in `CẢNH BÁO: seed không có adbkey` |
| `pull access denied` lúc deploy | Repo để private (bắt buộc) mà máy đích chưa `docker login` | `docker login` trên máy đích; job ④ của CI đã tự làm bước này |

---

## 8. Ba điều dễ mất tiền

**1. Image chứa thông tin đăng nhập Google.** Ai `docker pull` được là vào được
tài khoản. Repo Docker Hub phải private; `.gitignore` đã chặn seed khỏi git.

**2. Không chạy hai bản clone cùng lúc.** Clone giữ nguyên `android_id` và GSF
ID → Google coi là *một* thiết bị ở hai nơi, huỷ phiên một bên rồi bắt xác minh
lại. Seed là để **chuyển máy**, không phải để nhân bản đội worker. Nhiều worker
thì mỗi con một tài khoản và một seed riêng.

**3. Không phải vĩnh viễn.** Google vẫn thử thách lại sau vài tuần đến vài
tháng, nhanh hơn nếu đổi IP sang quốc gia khác. Giữ đường vào noVNC để còn xử lý
tay được — quy trình `./gui.sh on` → đăng nhập → `./gui.sh off` ở
[deploy-vps.md §9](deploy-vps.md).

---

## 9. Đã kiểm chứng end-to-end

Trên volume trắng, máy khác máy chụp seed:

- Android boot sau ~385 giây.
- Tài khoản Google và `android_id` giữ nguyên.
- `sdcard.img` được dựng lại đúng 2.0 GB.
- Thư mục AVD ở máy mới còn **4.9 GB** thay vì 15 GB như trước — nhờ bỏ cờ `-c`
  và không mang sdcard theo seed.

---

## 10. Tra nhanh

| Cần gì | Làm gì |
|---|---|
| Chụp seed mới | `cd deploy && ./capture-avd-seed.sh` |
| Đổi tài khoản Google | Đăng nhập lại qua noVNC → `capture-avd-seed.sh` → build → push |
| Tạo AVD trắng có chủ đích | `AVD_SEED_DISABLE=1` trong `.env.worker` |
| Deploy máy mới | `docker login` → `./bootstrap.sh --no-build` |
| Sửa code worker | Build + push tay từ máy giữ seed |
| Kiểm phiên còn sống | `adb shell dumpsys account \| grep 'Accounts:'` → phải ra `Accounts: 1` |
| Backup phiên | `tar` volume `worker-avd`, xem [deploy-vps.md §5](deploy-vps.md) |

Volume nào chứa gì và cờ `-v`: [docker.md §6](docker.md).
Tên image / tag / registry: [docker.md §8](docker.md).
