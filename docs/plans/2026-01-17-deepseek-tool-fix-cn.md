# DeepSeek 工具调用中断修复方案 (专用 GN 供应商模式)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**目标:** 通过引入专用的 "GN" (General NewAPI / DeepSeek) 供应商选项，针对性修复 DeepSeek V3.2 在 NewAPI 环境下 "工具调用中断" 的问题，而不影响标准的 OpenAI/Anthropic 逻辑。

**架构:**
1.  **Config**: 扩展 `HaloConfig` 支持 `gn` 供应商类型。
2.  **Frontend**: 在设置界面增加 "GN (DeepSeek)" 选项。
3.  **Router**: 在 `BackendConfig` 中增加 `isDeepSeek` 标志，并在请求转换层读取此标志。
4.  **Logic**: 仅当 `isDeepSeek` 为真时，在响应转换中实施 `finish_reason` 补丁。

**技术栈:** TypeScript, React, Electron, Halo Main Process

---

### 任务 1: 更新路由类型定义 (Router Types)

**Files:**
- Modify: `d:/AI/dify-1.7.1/hello-halo/src/main/openai-compat-router/types/index.ts`

**步骤 1: 更新 BackendConfig 接口**
在 `BackendConfig` 接口中添加 `isDeepSeek` 字段。

```typescript
export interface BackendConfig {
  url: string
  key: string
  model?: string
  isDeepSeek?: boolean // 标识是否为 DeepSeek/GN 模式
}
```

### 任务 2: 更新配置服务 (Config Service)

**Files:**
- Modify: `d:/AI/dify-1.7.1/hello-halo/src/main/services/config.service.ts`

**步骤 1: 更新 HaloConfig 类型**
将 `provider` 类型扩展为包含 `'gn'`。

```typescript
interface HaloConfig {
  api: {
    provider: 'anthropic' | 'openai' | 'custom' | 'gn' // Added 'gn'
    // ...
  }
}
```

**步骤 2: 更新 validateApiConnection**
`gn` 模式的验证逻辑与 `openai` 相同。

```typescript
// 在 if (provider === 'openai') 条件中加入 || provider === 'gn'
if (provider === 'openai' || provider === 'gn') {
    // ... 原有 OpenAI 验证逻辑
}
```

### 任务 3: 更新前端设置界面 (Frontend)

**Files:**
- Modify: `d:/AI/dify-1.7.1/hello-halo/src/renderer/components/setup/ApiSetup.tsx`

**步骤 1: 添加 GN 选项**
在供应商下拉菜单中添加选项。

```tsx
<select value={provider} ...>
  <option value="anthropic">{t('Claude (Recommended)')}</option>
  <option value="openai">{t('OpenAI Compatible')}</option>
  <option value="gn">{t('GN (DeepSeek)')}</option> {/* New Option */}
</select>
```

**步骤 2: 适配提示文案**
更新相关的提示文案，使 `gn` 模式显示类似 API URL 提示。

### 任务 4: 更新 Agent 服务 (Agent Service)

**Files:**
- Modify: `d:/AI/dify-1.7.1/hello-halo/src/main/services/agent.service.ts`

**步骤 1: 适配 ensureSessionWarm 和 sendMessage**
在处理 `api.provider` 时，增加对 `gn` 的处理。

```typescript
if (config.api.provider === 'openai' || config.api.provider === 'gn') {
    // ...
    anthropicApiKey = encodeBackendConfig({
      url: config.api.apiUrl,
      key: config.api.apiKey,
      model: config.api.model,
      isDeepSeek: config.api.provider === 'gn', // 仅 GN 模式开启 DeepSeek 修复
      ...(apiType ? { apiType } : {})
    })
    // ...
}
```

### 任务 5: 实施 DeepSeek 补丁 (Router Implementation)

**Files:**
- Modify: `d:/AI/dify-1.7.1/hello-halo/src/main/openai-compat-router/server/request-handler.ts`
- Modify: `d:/AI/dify-1.7.1/hello-halo/src/main/openai-compat-router/converters/response/openai-chat-to-anthropic.ts`

**步骤 1: 传递 isDeepSeek 上下文**
在 `request-handler.ts` 中，从解码后的 `backendConfig` 中读取 `isDeepSeek`，并将其传递给 `convertOpenAIChatToAnthropic`（需要更新函数签名以接受 options 或 context）。

**步骤 2: 更新转换函数签名**
在 `openai-chat-to-anthropic.ts` 中，更新 `convertOpenAIChatToAnthropic` 签名：

```typescript
export function convertOpenAIChatToAnthropic(
  openaiResponse: OpenAIChatResponse,
  requestModel?: string,
  options?: { isDeepSeek?: boolean } // 新增参数
): AnthropicMessageResponse
```

**步骤 3: 实施条件性补丁**
仅当 `options?.isDeepSeek` 为 `true` 时，执行之前的 `finish_reason` 修正逻辑。

```typescript
if (options?.isDeepSeek && hasToolCalls && finishReason === 'stop') {
    finishReason = 'tool_calls'
}
```

### 任务 6: 验证测试 (Tests)

**Files:**
- Modify: `d:/AI/dify-1.7.1/hello-halo/src/main/openai-compat-router/__tests__/converters.test.ts`

**步骤 1: 添加条件测试**
确保只有在开启 `isDeepSeek` 选项时，补丁才生效；否则由 DeepSeek 造成的错误应保持原样（虽然是错误，但我们要验证隔离性）。

```typescript
it('should patch DeepSeek bug ONLY when isDeepSeek is true', () => {
    // ... setup error response ...
    
    // Test WITHOUT flag (expect standard behavior / error)
    const result1 = convertOpenAIChatToAnthropic(response)
    expect(result1.stop_reason).toBe('end_turn') // Maps 'stop' -> 'end_turn'
    
    // Test WITH flag (expect fix)
    const result2 = convertOpenAIChatToAnthropic(response, undefined, { isDeepSeek: true })
    expect(result2.stop_reason).toBe('tool_use') // Fixed
})
```
