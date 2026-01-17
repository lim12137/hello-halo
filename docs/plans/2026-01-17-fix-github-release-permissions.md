# GitHub Release 403 权限修复实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**目标:** 修复 GitHub Actions 创建 Release 时的 403 Forbidden 权限错误

**架构:** 在 workflow 文件中添加 `permissions` 声明，授予 `GITHUB_TOKEN` 创建 Releases 所需的 `contents: write` 权限

**技术栈:** GitHub Actions, YAML

---

## 问题分析

**错误信息:**
```
HttpError: 403 Forbidden
"Resource not accessible by integration"
x-accepted-github-permissions: contents=write; contents=write,workflows=write
```

**根本原因:**
GitHub Actions 的 `GITHUB_TOKEN` 默认权限（从 2023 年开始）是只读的。要创建 Releases，需要显式声明 `contents: write` 权限。

---

## 任务清单

### Task 1: 添加 permissions 声明

**文件:**
- 修改: `.github/workflows/build-windows.yml:21-22`

**Step 1: 在 jobs 之前添加 permissions 块**

在 `jobs:` 行之前添加以下内容：

```yaml
permissions:
  contents: write

jobs:
```

**Step 2: 验证 YAML 语法**

运行: `npx yaml-lint .github/workflows/build-windows.yml` 或手动检查缩进

**Step 3: 提交更改**

```bash
git add .github/workflows/build-windows.yml
git commit -m "fix: add permissions for GitHub Release creation"
```

---

### Task 2: 推送并验证

**Step 1: 推送更改**

```bash
git push origin main
```

**Step 2: 删除现有失败的 tag（如果需要）**

```bash
git tag -d v1.x.x
git push origin :refs/tags/v1.x.x
```

**Step 3: 创建新 tag 触发工作流**

```bash
git tag v1.x.x
git push origin v1.x.x
```

**Step 4: 验证 GitHub Actions 运行**

访问: `https://github.com/openkursar/hello-halo/actions`

**预期结果:** 工作流运行成功，Release 自动创建

---

## 完整修改后的 workflow 文件

```yaml
name: Build Windows EXE

on:
  # 手动触发
  workflow_dispatch:
    inputs:
      publish:
        description: 'Publish to GitHub Release'
        required: false
        default: 'false'
        type: choice
        options:
          - 'true'
          - 'false'

  # Tag 推送触发 (v* 格式)
  push:
    tags:
      - 'v*'

permissions:
  contents: write

jobs:
  build-windows:
    runs-on: windows-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Prepare cloudflared for Windows x64
        run: npm run prepare:win-x64

      - name: Build application
        run: npm run build

      - name: Package Windows EXE
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          if ("${{ github.event_name }}" -eq "push" -or "${{ github.event.inputs.publish }}" -eq "true") {
            npx electron-builder --win --x64 --publish always
          } else {
            npx electron-builder --win --x64 --publish never
          }

      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: halo-windows-x64
          path: |
            dist/*.exe
            dist/*.exe.blockmap
          retention-days: 7
```

---

## 验收标准

| 检查项 | 验收条件 |
|--------|----------|
| ✅ permissions 声明 | workflow 文件包含 `permissions: contents: write` |
| ✅ YAML 语法正确 | 无语法错误 |
| ✅ Git 提交 | 更改已提交并推送 |
| ✅ Release 创建 | GitHub Actions 成功创建 Release |

---

## 验证步骤

1. 检查 workflow 文件中是否有 `permissions:` 块
2. 推送代码后观察 GitHub Actions 运行日志
3. 确认 Release 页面有新的发布版本
