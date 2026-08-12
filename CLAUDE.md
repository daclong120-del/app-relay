# Quy tắc bắt buộc

## Git — không bao giờ tự ý commit hoặc push

-   **KHÔNG chạy `git commit` khi chưa được cho phép.** Sửa file xong thì để nguyên  
    ở working tree và báo lại đã sửa gì. Người dùng tự quyết định lúc nào commit.
-   **KHÔNG chạy `git push` khi chưa được cho phép.** Push là hành động ra ngoài,  
    không lùi lại sạch được.
-   **Cho phép MỘT LẦN không phải cho phép mãi mãi.** Được duyệt commit lần này  
    thì lần sau vẫn phải hỏi lại. Đây chính là lỗi đã xảy ra ngày 2026-08-11:  
    một lần duyệt bị hiểu thành quyền vĩnh viễn, rồi tự commit + push thêm 5 lần.
-   Cách làm đúng: sửa file → tóm tắt thay đổi → **hỏi** “commit chứ?” → chờ trả lời.
-   `git status`, `git log`, `git diff`, `git show` thì thoải mái, không cần hỏi.
-   có một điều quan trọng tao phải nói với mày mỗi session mới mày sẽ thiếu thông tin thì trong thư mục docs có cái [readme.md](http://readme.md) mày đọc cái đó đi nó sẽ hướng dẫn mày hiểu, nó là một cái bản đồ của dự án này đó.

Đã có hai lớp chặn kỹ thuật ở `.claude/settings.json` (`permissions.ask` và một  
PreToolUse hook bắt cả dạng lệnh ghép `cd ... && git commit`). Mục này ghi lại  
**lý do**, để không phải chờ hộp thoại mới nhớ ra.

---

# GitNexus — Code Intelligence

This project is indexed by GitNexus as **app-relay** (628 symbols, 1013 relationships, 18 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

-   **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
-   **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
-   **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
-   When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
-   When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
-   For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

-   NEVER edit a function, class, or method without first running `impact` on it.
-   NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
-   NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
-   NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
| --- | --- |
| `gitnexus://repo/app-relay/context` | Codebase overview, check index freshness |
| `gitnexus://repo/app-relay/clusters` | All functional areas |
| `gitnexus://repo/app-relay/processes` | All execution flows |
| `gitnexus://repo/app-relay/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
| --- | --- |
| Understand architecture / “How does X work?” | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / “What breaks if I change X?” | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / “Why is X failing?” | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |