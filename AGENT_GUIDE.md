# Halo 项目开发指南 (Agent Guide)

这份文档旨在帮助 AI Agent 快速理解 Halo 项目的结构、技术栈和开发规范。

## 1. 项目概览
**Halo** 是一个开源的跨平台桌面应用，旨在为 Claude Code 提供可视化的交互界面。
- **核心理念**: 将复杂的 CLI Agent 能力转化为直观的 GUI 体验。
- **主要功能**: 可视化 Agent 循环、文件预览 (Artifact Rail)、远程访问 (手机/Web)、内置 AI 浏览器 (CDP)、MCP 支持。

## 2. 技术栈
- **框架**: [Electron](https://www.electronjs.org/) + [electron-vite](https://electron-vite.org/)
- **前端**: React 18 + TypeScript + [Tailwind CSS](https://tailwindcss.com/)
- **UI 组件**: Shadcn/ui 风格模式
- **状态管理**: Zustand
- **Agent 核心**: `@anthropic-ai/claude-code` SDK
- **Markdown 渲染**: encoded via `react-markdown` + `highlight.js`

## 3. 目录结构分析

```
d:\AI\dify-1.7.1\hello-halo\
├── .agent/                 # Agent 专属的工作流 (Workflows) 和技能 (Skills)
├── .github/                # GitHub Actions 和模板
├── resources/              # 静态资源 (图标、图片等)
├── scripts/                # 构建和维护脚本 (如 i18n, icons)
├── src/
│   ├── main/               # Electron 主进程代码 (IPC, 系统交互)
│   ├── preload/            # Electron Preload 脚本 (安全桥接)
│   └── renderer/           # React 前端代码
│       ├── src/components/ # UI 组件
│       ├── src/hooks/      # 自定义 Hooks
│       └── src/i18n/       # 国际化翻译文件
├── tests/                  # 测试目录 (Unit via Vitest, E2E via Playwright)
├── electron.vite.config.ts # 构建配置
└── package.json            # 依赖与脚本
```

## 4. 关键开发命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动开发服务器 (Electron + Vite) |
| `npm run build` | 构建生产版本 |
| `npm run test:unit` | 运行单元测试 (Vitest) |
| `npm run test:e2e` | 运行端到端测试 (Playwright) |
| `npm run i18n` | 提取并翻译国际化文本 |
| `npm run icons` | 生成应用图标 |

## 5. 核心逻辑说明
- **IPC 通信**: 前端 (Renderer) 与后端 (Main) 通过 IPC 交换数据。主要逻辑在 `src/main` 中处理系统级操作（文件读写、CLI 调用）。
- **Agent Loop**: 集成 `@anthropic-ai/claude-code` SDK，在主进程中运行 Agent 逻辑，通过事件流将状态推送到前端。
- **Artifacts**: 类似于 Claude 的 Artifacts 功能，Halo 在本地通过文件系统实现，并在前端 `Artifact Rail` 渲染。

## 6. 注意事项
1. **本地优先**: 所有数据默认存储在本地 (`~/.halo/`)，不依赖云端后端。
2. **样式规范**: 严格使用 Tailwind CSS 类名，保持 UI 一致性。
3. **i18n**: 修改 UI 文本时，必须考虑多语言支持 (查看 `src/renderer/i18n/`)。
4. **.agent 目录**: 利用 `.agent/skills` 中的定义来增强 AI 的辅助能力。

---
*Created by Antigravity for future Agents.*
