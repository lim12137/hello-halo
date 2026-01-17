# GN Provider DeepSeek 模型动态修复实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 完善 GN Provider，支持基于模型名称动态触发 DeepSeek `finish_reason` 修复

**Architecture:** 
- GN Provider 已存在于 `ApiProvider` 类型中，但 SettingsPage.tsx 缺少 UI 选项
- 修改 `isDeepSeek` 逻辑：从静态 `provider === 'gn'` 改为动态检测模型名称是否包含 "deepseek"（不区分大小写）
- 这样 GN Provider 可以同时支持 DeepSeek 和 Qwen3 等其他模型

**Tech Stack:** TypeScript, React

---

## 清单 (Checklist)

- [ ] Task 1: 在 SettingsPage.tsx 添加 GN Provider 选项
- [ ] Task 2: 修改 isDeepSeek 判断逻辑为基于模型名称
- [ ] Task 3: 更新单元测试
- [ ] Task 4: 验证修复

---

### Task 1: 在 SettingsPage.tsx 添加 GN Provider 选项

**Files:**
- Modify: `src/renderer/pages/SettingsPage.tsx:296-336`

**Step 1: 在 provider 下拉列表添加 GN 选项**

修改第 328-330 行的 select options：

```tsx
<select
  value={provider}
  onChange={(e) => {
    const next = e.target.value as any
    setProvider(next)
    setValidationResult(null)
    // sensible defaults when switching
    if (next === 'anthropic') {
      if (!apiUrl || apiUrl.includes('openai')) setApiUrl('https://api.anthropic.com')
      if (!model || !model.startsWith('claude-')) {
        setModel(DEFAULT_MODEL)
        setUseCustomModel(false)
      }
    } else if (next === 'openai') {
      if (!apiUrl || apiUrl.includes('anthropic')) setApiUrl('https://api.openai.com')
      if (!model || model.startsWith('claude-')) setModel('gpt-4o-mini')
    } else if (next === 'gn') {
      if (!apiUrl || apiUrl.includes('anthropic')) setApiUrl('https://api.deepseek.com')
      if (!model || model.startsWith('claude-')) setModel('deepseek-chat')
    }
  }}
  className="w-full px-4 py-2 bg-input rounded-lg border border-border focus:border-primary focus:outline-none transition-colors"
>
  <option value="anthropic">{t('Claude (Recommended)')}</option>
  <option value="openai">{t('OpenAI Compatible')}</option>
  <option value="gn">{t('GN (DeepSeek)')}</option>
</select>
```

**Step 2: 更新标题显示逻辑**

修改第 296-298 行的标题显示：

```tsx
<h2 className="text-lg font-medium">
  {provider === 'anthropic'
    ? t('Claude (Recommended)')
    : provider === 'gn'
      ? t('GN (DeepSeek)')
      : t('OpenAI Compatible')}
</h2>
```

**Step 3: 运行开发服务器验证**

```bash
npm run dev
```

Expected: SettingsPage 应该显示 3 个 provider 选项

**Step 4: Commit**

```bash
git add src/renderer/pages/SettingsPage.tsx
git commit -m "feat(ui): add GN provider option to SettingsPage"
```

---

### Task 2: 修改 isDeepSeek 判断逻辑为基于模型名称

**Files:**
- Modify: `src/main/services/agent.service.ts:473-476`
- Modify: `src/main/services/agent.service.ts:1017-1020` (另一处 encodeBackendConfig 调用)

**Step 1: 创建辅助函数判断是否为 DeepSeek 模型**

在 agent.service.ts 顶部添加辅助函数（约第 60 行后）：

```typescript
/**
 * Check if model name indicates DeepSeek (case-insensitive)
 * Used to trigger DeepSeek-specific fixes (finish_reason patch)
 */
function isDeepSeekModel(modelName?: string): boolean {
  if (!modelName) return false
  return modelName.toLowerCase().includes('deepseek')
}
```

**Step 2: 修改第一处 encodeBackendConfig 调用（约第 472-478 行）**

将：
```typescript
anthropicApiKey = encodeBackendConfig({
  url: config.api.apiUrl,
  key: config.api.apiKey,
  model: config.api.model,  // Real model passed to Router
  isDeepSeek: config.api.provider === 'gn',
  ...(apiType ? { apiType } : {})
})
```

改为：
```typescript
anthropicApiKey = encodeBackendConfig({
  url: config.api.apiUrl,
  key: config.api.apiKey,
  model: config.api.model,  // Real model passed to Router
  isDeepSeek: config.api.provider === 'gn' && isDeepSeekModel(config.api.model),
  ...(apiType ? { apiType } : {})
})
```

**Step 3: 修改第二处 encodeBackendConfig 调用（约第 1017 行）**

同样更新逻辑。

**Step 4: 更新日志信息**

将约第 481 行的日志：
```typescript
console.log(`[Agent] ${config.api.provider === 'gn' ? 'GN (DeepSeek)' : 'OpenAI'} provider enabled (warm): routing via ${anthropicBaseUrl}`)
```

改为更精确的：
```typescript
const isDeepSeek = config.api.provider === 'gn' && isDeepSeekModel(config.api.model)
console.log(`[Agent] ${config.api.provider === 'gn' ? `GN (${isDeepSeek ? 'DeepSeek patch enabled' : 'standard'})` : 'OpenAI'} provider enabled (warm): routing via ${anthropicBaseUrl}`)
```

**Step 5: Commit**

```bash
git add src/main/services/agent.service.ts
git commit -m "feat(gn): enable DeepSeek fix only when model name contains 'deepseek'"
```

---

### Task 3: 更新单元测试

**Files:**
- Modify: `src/main/openai-compat-router/__tests__/converters.test.ts`

**Step 1: 添加模型名称检测测试**

在现有的 DeepSeek patch 测试后添加：

```typescript
it('should verify isDeepSeek flag is model-name-based', () => {
  // This test documents the expected behavior:
  // - GN provider + "deepseek-chat" model -> isDeepSeek: true
  // - GN provider + "qwen3-72b" model -> isDeepSeek: false
  
  // The actual isDeepSeek logic is in agent.service.ts, not in converters.
  // Converters just receive the flag and apply the patch.
  // This test verifies the converter respects the flag correctly.
  
  const responseWithToolCalls = {
    id: 'test',
    object: 'chat.completion',
    created: Date.now(),
    model: 'qwen3-72b',  // Non-DeepSeek model
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: null,
        tool_calls: [{ id: 't1', type: 'function', function: { name: 'test', arguments: '{}' } }]
      },
      finish_reason: 'stop'  // Bug: should be 'tool_calls'
    }]
  }
  
  // When isDeepSeek is false (for Qwen3), patch should NOT be applied
  const resultNoPatch = convertOpenAIChatToAnthropic(responseWithToolCalls, undefined, { isDeepSeek: false })
  expect(resultNoPatch.stop_reason).toBe('end_turn')  // Standard mapping, no patch
  
  // When isDeepSeek is true, patch should be applied
  const resultWithPatch = convertOpenAIChatToAnthropic(responseWithToolCalls, undefined, { isDeepSeek: true })
  expect(resultWithPatch.stop_reason).toBe('tool_use')  // Patched
})
```

**Step 2: 运行测试**

```bash
npm test -- --grep "isDeepSeek"
```

Expected: PASS

**Step 3: Commit**

```bash
git add src/main/openai-compat-router/__tests__/converters.test.ts
git commit -m "test: add model-name-based isDeepSeek verification test"
```

---

### Task 4: 验证修复

**Step 1: 构建应用**

```bash
npm run build
```

Expected: 无编译错误

**Step 2: 手动测试场景**

1. 打开 Settings 页面
2. 切换 Provider 到 "GN (DeepSeek)"
3. 确认 URL 默认为 `https://api.deepseek.com`
4. 输入模型名 `deepseek-chat` -> 应该触发修复
5. 输入模型名 `qwen3-72b` -> 不应该触发修复

**Step 3: Commit 所有更改**

```bash
git add .
git commit -m "feat: complete GN provider with model-based DeepSeek fix"
```

---

## 验收标准 (Acceptance Criteria)

1. ✅ SettingsPage.tsx 显示 3 个 provider 选项：Claude、OpenAI Compatible、GN (DeepSeek)
2. ✅ 选择 GN provider 时，URL 默认为 `https://api.deepseek.com`
3. ✅ 当 provider=gn 且 model 名包含 "deepseek" 时，`isDeepSeek: true`
4. ✅ 当 provider=gn 且 model 名不包含 "deepseek"（如 qwen3）时，`isDeepSeek: false`
5. ✅ 所有测试通过

## 验证步骤 (Verification Steps)

```bash
# 1. 运行单元测试
npm test

# 2. 类型检查
npm run typecheck

# 3. 构建
npm run build

# 4. 启动开发服务器测试 UI
npm run dev
```
