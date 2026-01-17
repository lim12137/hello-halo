# GitHub Actions 自动构建 Windows EXE 实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**目标:** 创建 GitHub Actions 工作流，在推送 Tag 或手动触发时，自动构建 Windows x64 安装包 (.exe) 并上传到 GitHub Release。

**架构:**
1. 使用 `windows-latest` runner 环境执行构建。
2. 利用 `electron-builder` 的 `--win --x64` 参数构建 NSIS 安装程序。
3. 构建产物自动上传至 GitHub Release（通过 `electron-builder` 的 `--publish always`）。
4. 支持手动触发 (`workflow_dispatch`) 和 Tag 推送触发 (`push: tags`)。

**技术栈:** GitHub Actions, Node.js, electron-builder, NSIS

---

### 任务 1: 创建 GitHub Actions 工作流目录

**Files:**
- Create: `.github/workflows/` (目录)

**步骤 1: 创建 workflows 目录**

```bash
mkdir -p .github/workflows
```

**步骤 2: 验证目录创建成功**

```bash
ls -la .github/
# 预期输出: 包含 workflows 目录
```

**步骤 3: 提交**

```bash
git add .github/workflows
git commit -m "chore: create github workflows directory"
```

---

### 任务 2: 创建 Windows 构建工作流文件

**Files:**
- Create: `.github/workflows/build-windows.yml`

**步骤 1: 创建工作流文件**

创建 `.github/workflows/build-windows.yml`，内容如下：

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

**步骤 2: 验证 YAML 语法**

```bash
# 使用 yamllint 或在线工具验证语法
cat .github/workflows/build-windows.yml
```

**步骤 3: 提交**

```bash
git add .github/workflows/build-windows.yml
git commit -m "feat: add GitHub Actions workflow for Windows EXE build"
```

---

### 任务 3: 配置 electron-builder 发布设置

**Files:**
- Modify: `package.json` (可选，确认配置正确)

**步骤 1: 验证 package.json 中的发布配置**

确保 `package.json` 中的 `build.publish` 配置正确：

```json
"publish": {
  "provider": "github",
  "owner": "openkursar",
  "repo": "hello-halo",
  "releaseType": "release"
}
```

**步骤 2: 验证 Windows 构建配置**

确保 `package.json` 中的 `build.win` 配置正确：

```json
"win": {
  "icon": "resources/icon.ico",
  "target": [
    {
      "target": "nsis",
      "arch": ["x64"]
    }
  ]
}
```

**步骤 3: 如需修改，提交更改**

```bash
git add package.json
git commit -m "chore: verify electron-builder publish config"
```

---

### 任务 4: 测试工作流 (手动触发)

**步骤 1: 推送更改到 GitHub**

```bash
git push origin main
```

**步骤 2: 在 GitHub 上手动触发工作流**

1. 进入仓库的 **Actions** 页面
2. 选择 **Build Windows EXE** 工作流
3. 点击 **Run workflow** 按钮
4. 选择 `publish: false`（测试模式，不发布到 Release）
5. 点击 **Run workflow**

**步骤 3: 验证构建成功**

- 检查工作流日志，确认所有步骤通过
- 下载 Artifact 中的 `.exe` 文件，验证可安装

---

### 任务 5: 测试 Tag 触发发布

**步骤 1: 创建新 Tag**

```bash
git tag v1.2.4
git push origin v1.2.4
```

**步骤 2: 验证自动触发**

1. 进入仓库的 **Actions** 页面
2. 确认 **Build Windows EXE** 工作流被自动触发
3. 等待构建完成

**步骤 3: 验证 Release 发布**

1. 进入仓库的 **Releases** 页面
2. 确认新 Release 包含 `.exe` 安装包
3. 下载并测试安装

---

### 任务 6: (可选) 添加构建状态徽章

**Files:**
- Modify: `README.md`

**步骤 1: 添加徽章到 README**

在 `README.md` 顶部添加：

```markdown
[![Build Windows EXE](https://github.com/openkursar/hello-halo/actions/workflows/build-windows.yml/badge.svg)](https://github.com/openkursar/hello-halo/actions/workflows/build-windows.yml)
```

**步骤 2: 提交**

```bash
git add README.md
git commit -m "docs: add build status badge"
git push origin main
```

---

## 验收标准

- [ ] `.github/workflows/build-windows.yml` 文件存在且语法正确
- [ ] 手动触发工作流可成功构建 EXE
- [ ] Tag 推送可自动触发构建并发布到 Release
- [ ] 生成的 EXE 可正常安装和运行
- [ ] Artifact 保留 7 天供调试

## 注意事项

1. **GITHUB_TOKEN 权限**: 默认的 `GITHUB_TOKEN` 具有发布 Release 的权限，无需额外配置 PAT。
2. **构建时间**: Windows 构建通常需要 5-10 分钟。
3. **缓存优化**: 工作流使用 `npm ci` 和 Node.js 缓存来加速依赖安装。
4. **Cloudflared 依赖**: `npm run prepare:win-x64` 步骤确保下载正确架构的 cloudflared 二进制。
