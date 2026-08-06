# 📂 AppRelay Documentation Architecture

Cấu trúc thư mục tài liệu của dự án được tổ chức theo mô hình **10 Tầng Quản Lý Vòng Đời Phần Mềm (Software Lifecycle Documentation Blueprint)**.

---

## 🗺️ Bản Đồ Thư Mục Documentation

### 🎯 TẦNG 1: TIẾP NHẬN & THU THẬP YÊU CẦU (`01-requirements/`)
- `01-requirements/brd/`: Business Requirements Document (Yêu cầu nghiệp vụ vĩ mô)
- `01-requirements/srs-prd/actor-profile/`: System Actor Profiles (Tác nhân hệ thống)
- `01-requirements/srs-prd/use-cases/`: Use Case Specifications (Kịch bản sử dụng)
- `01-requirements/meeting-minutes/`: Biên bản họp & ghi chép khảo sát

---

### 🎨 TẦNG 2A: QUY CHUẨN MỸ THUẬT & TRẢI NGHIỆM (`02a-design-system/`)
- `02a-design-system/brand-guidelines/`: Brand Guidelines & Quy chuẩn thương hiệu
- `02a-design-system/ui-style-guide/`: UI Style Guide & Design System
  - 📄 [`design-creative-lutech.md`](file:///d:/super-tools/app-relay/docs/02a-design-system/ui-style-guide/design-creative-lutech.md): Quy chuẩn thiết kế UI/UX & Design Tokens (Lutech style)
- `02a-design-system/art-bible/`: Art Specification (Mỹ thuật/Animation)

---

### 🛠️ TẦNG 2B: QUY CHUẨN KHỞI NGUYÊN KỸ THUẬT (`02b-tech-standards/`)
- `02b-tech-standards/architecture-baseline/`: Kiến trúc nền tảng có sẵn
- `02b-tech-standards/tech-stack-blueprint/`: Quy định Framework, DB, Thư viện
- `02b-tech-standards/coding-testing-standards/`: Coding Conventions & Testing Standards
- `02b-tech-standards/license-compliance/`: Tuân thủ bản quyền mã nguồn mở

---

### 📐 TẦNG 3: QUY HOẠCH VÀ PHÁC THẢO (`03-macro-architecture/`)
- 📄 [`ARCHITECTURE_MASTER.md`](file:///d:/super-tools/app-relay/docs/03-macro-architecture/ARCHITECTURE_MASTER.md): Master Architecture Document / SAD (Tài liệu tổng thể quản lý dự án)
- `03-macro-architecture/technical-rfc/`: Technical RFC & Phác thảo hướng đi kỹ thuật

---

### 📦 TẦNG 4: THIẾT KẾ CHI TIẾT THÀNH PHẦN (`04-detailed-design/`)
- `04-detailed-design/ui-ux-deliverables/`: Wireframes, Mockups, Interactive Prototypes
- `04-detailed-design/cdd-lld/`: Component Design Documents (CDD / LLD)
  - `functional-modules/`: Thiết kế chi tiết các module chức năng
  - `api-spec/`: API Specification & Contracts
    - 📄 [`API_SPEC.md`](file:///d:/super-tools/app-relay/docs/04-detailed-design/cdd-lld/api-spec/API_SPEC.md): Đặc tả REST & Worker API
    - 📄 [`openapi.yaml`](file:///d:/super-tools/app-relay/docs/04-detailed-design/cdd-lld/api-spec/openapi.yaml): OpenAPI 3.1.0 Schema (Tự động sinh từ TypeScript Zod Schemas)
  - `data-models/`: Database Schemas & ERD Models
  - `business-logic/`: Sơ đồ thuật toán & Business Logic Specs
  - `cicd-infrastructure/`: CI/CD Pipeline Spec & IaC
  - `ai-model-card/`: AI Model Cards & Data Lineage

---

### 🛡️ TẦNG 5: AN TOÀN VÀ BẢO MẬT (`05-security-compliance/`)
- `05-security-compliance/`: Security Policies, Encryption Standards, Compliance

---

### 🧪 TẦNG 6: LẬP KẾ HOẠCH & KỊCH BẢN KIỂM THỬ (`06-testing/`)
- `06-testing/test-plans/`: Master Test Plan & Scope Definition
- `06-testing/test-cases/manual-test-cases/`: Manual Test Cases
- `06-testing/test-cases/automation-scripts/`: Automation Test Scripts

---

### 🤝 TẦNG 7: NGHIỆM THU & BÀN GIAO (`07-acceptance-handover/`)
- `07-acceptance-handover/uat-signoff/`: UAT Scripts & Biên bản nghiệm thu
  - 📄 [`UAT_PULL_PLAY_STORE_APK_SUCCESS.md`](file:///d:/super-tools/app-relay/docs/07-acceptance-handover/uat-signoff/UAT_PULL_PLAY_STORE_APK_SUCCESS.md): Báo cáo nghiệm thu UAT pull APK & listing từ Play Store (Thành công 100%)
- `07-acceptance-handover/user-guides/`: Hướng dẫn sử dụng cho End-User / vận hành
- `07-acceptance-handover/handover/`: Biên bản bàn giao tài sản dự án

---

### 🚀 TẦNG 8: VẬN HÀNH, NÂNG CẤP VÀ BIẾN ĐỘNG (`08-operations-and-evolution/`)
- `08-operations-and-evolution/as-is/`: Tài liệu hiện trạng hệ thống đang chạy
  - 📄 [`ARCHITECTURE_APP_REPLAY_V1.md`](file:///d:/super-tools/app-relay/docs/08-operations-and-evolution/as-is/ARCHITECTURE_APP_REPLAY_V1.md): AppRelay V1 Current-State Architecture Spec
- `08-operations-and-evolution/to-be-v2/`: Architecture To-Be V2 Spec
- `08-operations-and-evolution/to-be-v3/`: Architecture To-Be V3 Spec
- `08-operations-and-evolution/adr/`: Architecture Decision Records (ADR)
- `08-operations-and-evolution/change-requests/`: Change Requests (CR)

---

### 🚑 TẦNG 9: BẢO TRÌ & CỨU HỘ (`09-maintenance-runbook/`)
- 📄 [`OPERATIONAL_RUNBOOK.md`](file:///d:/super-tools/app-relay/docs/09-maintenance-runbook/OPERATIONAL_RUNBOOK.md): Operational Runbook & Emergency Playbook
- `09-maintenance-runbook/post-mortem/`: Post-Mortem & Root Cause Analysis (RCA)

---

### 📴 TẦNG 10: KHAI TỬ (`10-deprecation/`)
- `10-deprecation/`: Deprecation Plan & Sunsetting Documentation
