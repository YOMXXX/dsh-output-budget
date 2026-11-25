# dsh-output-budget（输出预算）

[English](README.md) | 中文

给 [DeepSeek Harness](https://www.deepseek.com/harness/) 的工具输出做「按形状的预算」。

每个工具结果在进入模型上下文之前被检查一次：噪音大、结构已知的输出被压成更密的一版，完整原文通过
harness 的 spill 存储落盘，模型看到一条明确的可回取提示。**错误输出一个字节都不动。**

```
$ git log --oneline -80
517963bc6 fix(resume): 表格表样 Markdown 仅保留换行与列表
…
36e925902 Merge branch 'feature/setting-tag-20261013' into 'master'
[... +50 more commits ...]

(Omitted 3301 bytes. Full formatted result stored at: /…/session-…/06aca161290b-bash.txt. Use read with offset/limit, or grep this path to search within it.)
```

## 做什么

| 形状 | 触发 | 重写方式 |
|---|---|---|
| `git-status` | `git status`（长输出或 porcelain） | 去掉建议行，每组文件截断，冲突全留 |
| `git-log` | `git log`、`git log --oneline -n` | 保留 30 条 + 剩余计数 |
| `git-diff` | `git diff`、`git show` | 每文件 `+a/-b` 统计 + hunk 头 + 每 hunk 6 行 |
| `listing` | `ls`、`find`、`tree`、`fd`、`du` | 100 条 + 剩余计数 |
| `search` | `grep`、`rg` 或 `grep` 工具 | 按文件聚合，带命中数 |
| `package` | `pnpm/npm/yarn/bun install|add|ci` | 警告 + 错误 + 尾部 |
| `bash` | 其他 shell 调用 | 去 ANSI/进度帧、折叠重复行、首 40 + 尾 40、错误窗口 |

只有同时满足「长度 ≥ `minChars`」「摘要更短」「不是已有摘要」时才重写。

## 永远不做

- **不重写失败**：`isError`、非零退出码、被信号中断、超时、被沙箱拒绝 —— 原样保留。
- **不重写 `read`**：模型要的行就是它拿到的行。
- **不改你的命令**：没有 pre-execute 改写，只改模型可见文本，`value` 保持原样。
- **不隐藏输出**：每次重写都带省略字节数和 locator，harness 界面仍把它识别为 spill 预览。

## 安装

DSH 里：**插件 → 添加插件 →** 搜索 `dsh-output-budget` → **安装**，然后启用。

命令行（npm 上线后）：

```sh
dsh plugin --profile <profile> add dsh-output-budget
```

npm 上线前，用 Release 里的 tarball：

```sh
dsh plugin --profile <profile> add \
  https://github.com/YOMXXX/dsh-output-budget/releases/download/v0.1.0/dsh-output-budget-0.1.0.tgz
```

纯 Host 插件：无 client 包、无需构建、无外部二进制。

## 配置

在 profile 的 `cordis.patch.yml` 里覆盖该行：

```yaml
- id: dsh-output-budget
  name: dsh-output-budget
  config:
    mode: dry-run
    maxContentChars: 6000
```

| 配置 | 默认 | 说明 |
|---|---|---|
| `enabled` | `true` | 总开关；`false` 时结果逐字节还原 |
| `mode` | `apply` | `apply` 重写、`dry-run` 只计量、`off` 全关 |
| `maxContentChars` | `6000` | 目标摘要长度（约 4 字符/token） |
| `minChars` | `1200` | 短于该长度不处理 |
| `spill` | `true` | 通过 harness spill 存储保存原文 |
| `digestBashGeneric` | `true` | 通用 shell 清理 |
| `digestListing` | `true` | 目录列表截断 |
| `digestGit` | `true` | `git status`/`log`/`diff` |
| `digestSearch` | `true` | 搜索命中按文件聚合 |
| `digestPackage` | `true` | 包管理器警告与错误 |
| `digestTest` | `false` | 测试运行器输出，默认关闭 |

想先看数字再决定，就把 `mode` 设成 `dry-run`。

## `/budget` 命令

在会话里输入 `/budget`，打印本进程已处理与已节省的量：

```
output-budget (this process)
inspected 41 result(s), rewrote 33
saved 812,441 chars (~203,110 tokens)
```

`/budget dry-run`、`/budget on`、`/budget off` 可临时切换模式做 A/B；要跨重启生效仍改 patch。

## 离线报告

```sh
node scripts/ab.mjs records.jsonl   # {"command":"git status","output":"…"}
```

脚本会重放记录并断言「失败行零丢失」，有丢失就以非零退出码结束。

## 已知限制

- 摘要基于**启发式**而非完整命令解析：少见的命令方言会退回通用形状（安全但不激进）。
- `digestTest` 默认关闭，因为各测试运行器输出差异大，建议按项目开启。
- 摘要后结果是纯文本：Web 界面不再渲染成富终端卡片，但完整原文仍可经 spill 提示取回。
- 只处理纯文本结果；带图片的结果原样放过。
- 原文保存在 harness 管理的会话 spill 目录，保留策略跟随 harness 自身设置。

## 开发

```sh
node --test          # 36 个单测
node scripts/ab.mjs records.jsonl
```

## 兼容性

- DSH `^0.2.3-alpha.2`。
- 已在 DSH Desktop `0.2.3-alpha.2`（macOS）真实会话实测：`git status`/`git log` 摘要生效、失败命令
  原样保留、spill locator 可写可读。`/budget` 命令与 Plugins 页元数据经单测与 Config 投影验证，
  尚未用鼠标点过界面。

## 许可

MIT
