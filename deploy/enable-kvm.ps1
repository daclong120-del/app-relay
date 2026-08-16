# Nạp module kvm_intel vào distro docker-desktop.
#
# VÌ SAO CẦN: kernel WSL không tự nạp kvm_intel, nên /dev/kvm không tồn tại
# trong VM của Docker Desktop. Thiếu nó thì compose.kvm.yaml không gắn được
# device vào container worker, emulator rơi về software emulation (TCG) và chậm
# hơn cỡ 20 lần — đo thật ngày 2026-08-16: boot 30 giây có KVM, hơn 10 phút khi
# không có.
#
# `.wslconfig` đã có nestedVirtualization=true và cờ vmx ĐÃ được expose vào VM;
# thứ duy nhất thiếu là module. Đừng đi sửa .wslconfig nữa, không phải chỗ đó.
#
# Chạy tay:  powershell -ExecutionPolicy Bypass -File deploy\enable-kvm.ps1
# Tự động :  Task Scheduler "AppRelay-EnableKVM" gọi file này lúc đăng nhập.

$ErrorActionPreference = 'Continue'

# PHẢI gọi qua `sh -c`, KHÔNG dùng `wsl -e modprobe kvm_intel`. Cờ -e nạp binary
# thẳng không qua shell nên không phân giải PATH, và lỗi ra là
# "execvpe(modprobe) failed: No such file or directory" — trông như thiếu
# modprobe, thật ra nó nằm ở /sbin/modprobe (symlink busybox).
for ($i = 0; $i -lt 30; $i++) {
    wsl.exe -d docker-desktop -e sh -c 'modprobe kvm_intel && test -e /dev/kvm'
    if ($LASTEXITCODE -eq 0) {
        Write-Output "kvm_intel da nap sau $i lan thu — /dev/kvm san sang."
        exit 0
    }
    # Lúc mới đăng nhập, distro docker-desktop thường chưa sẵn sàng.
    Start-Sleep -Seconds 10
}

Write-Output "KHONG nap duoc kvm_intel sau 30 lan thu (5 phut)."
exit 1
