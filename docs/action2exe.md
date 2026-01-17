# GitHub Actions 自动化打包 Release 避坑指南 (action2exe)

在使用 GitHub Actions 自动进行 Electron 桌面应用打包并发布至 GitHub Release 时，常会遇到权限导致的失败。本文总结了 `hello-halo` 项目中遇到的 `403 Forbidden` 问题及其解决方案。

## 1. 典型问题描述

**现象**：
在 `electron-builder` 尝试创建或更新 GitHub Release 时报错：
```log
HttpError: 403 Forbidden
"method: post url: https://api.github.com/repos/owner/repo/releases
Data: {"message":"Resource not accessible by integration", ...}
```

**原因**：
GitHub Actions 默认提供的 `GITHUB_TOKEN` 权限不足。默认情况下，该 Token 往往只有读取 (Read) 权限，没有创建 Release 和推送内容的写入 (Write) 权限。

---

## 2. 核心解决方案

### 方案 A：在 Workflow 脚本中显式声明权限（推荐）

这是最规范的做法。在你的 `.yml` 文件的 Job 级别明确授予写入权限：

```yaml
jobs:
  build-windows:
    runs-on: windows-latest
    permissions:
      contents: write  # 必须！允许 Actions 创建 Release 和上传内容
    steps:
      ...
```

### 方案 B：仓库设置开启全局写入权限

即使在脚本中声明了权限，如果仓库全局设置禁用了写入，依然会失败：
1. 进入仓库 **Settings** -> **Actions** -> **General**。
2. 找到 **Workflow permissions**。
3. 勾选 **Read and write permissions** 并保存。

### 方案 C：使用自定义 Personal Access Token (PAT) —— 【最稳妥方案】

如果 `GITHUB_TOKEN` 因仓库组织政策或其他限制无法生效，最稳重的做法是：
1. **生成 PAT**：在 GitHub [Tokens (classic)](https://github.com/settings/tokens) 页面生成一个 token，至少勾选 `repo` 权限。
2. **配置 Secret**：在仓库设置中添加 `GH_TOKEN_RELEASE`。
3. **注入环境**：

```yaml
      - name: Package Windows EXE
        env:
          GH_TOKEN: ${{ secrets.GH_TOKEN_RELEASE }}
        run: |
          if ("${{ github.event_name }}" -eq "push" -or "${{ github.event.inputs.publish }}" -eq "true") {
            npx electron-builder --win --x64 --publish always
          } else {
            npx electron-builder --win --x64 --publish never
          }
```

---

## 3. PowerShell 语法避坑 (Windows Runner 特有)

在 `windows-latest` 环境下，GitHub Actions 默认使用 **PowerShell**。

- **逻辑连接符**：不要使用 `&&`，改用 `;`。
  - ❌ `git add .; git commit -m "fix" && git push`
  - ✅ `git add .; git commit -m "fix"; git push`
- **变量引用**：Shell 变量（如 `${{ secrets... }}`）会被直接替换。在逻辑判断中，字符串建议用双引号括起来，例如：`if ("${{ github.event_name }}" -eq "push")`。

---

## 4. 进阶技巧：不推送到 GitHub Release，直接生成下载链接

在开发测试阶段，如果你不想每次构建都创建一个正式的 GitHub Release，或者受限于权限无法推送，可以利用 GitHub Actions 的 **Artifacts** 功能。这会在 Actions 的运行记录中直接生成一个可供下载的压缩包。

**实现方式**：
1. 在打包步骤中设置 `--publish never`，确保不触发发布逻辑。
2. 使用 `actions/upload-artifact@v4` 指令将构建出的 `.exe` 文件上传。

**示例代码节选**：

```yaml
      - name: Build and Package
        # 显式禁止发布
        run: npx electron-builder --win --x64 --publish never

      - name: Upload Artifact
        uses: actions/upload-artifact@v4
        with:
          name: windows-installer
          path: dist/*.exe  # 指向你打包出来的 exe 文件所在路径
```

**优势**：
- **配置简单**：不需要额外的 `GITHUB_TOKEN` 写入权限或 `GH_TOKEN` Secret。
- **环境隔离**：测试构建不会污染正式的 Release 版本列表。
- **查看方便**：构建完成后，直接在 Actions 运行详情页面的 **Summary** 底部即可看到并下载。

---

## 📋 验证清单 (Checklist)

- [x] `.yml` 的 Job 级别包含了 `permissions: contents: write` (若需发布 Release)
- [x] 仓库 Actions 设置已开启 `Read and write permissions`
- [x] 配置了名为 `GH_TOKEN_RELEASE` 的 Secret (若使用方案 C)
- [x] Workflow 脚本中的判断逻辑兼容 PowerShell
- [x] **(可选)** 若使用 Artifacts 模式，已配置 `actions/upload-artifact` 步骤
- [x] 推送 Tag (如 `v1.0.1`) 验证触发完整流程
