# FlowHub · AI 调度中枢

聚合多 AI 会话的「调度中枢」。两个核心痛点：
- **Kimi 等长文本 AI 上限爆了重开新会话丢上下文** → 自动摘要接力
- **不同 AI 各有所长但要切十几个标签页** → 一键分发调度

个人 MVP · 单机模式 · 数据存 localStorage · 一键部署到 Vercel。

---

## 技术栈

- **Next.js 14** App Router + TypeScript
- **Tailwind CSS** + 自定义 tokens（深色玻璃拟态 + 极光渐变）
- **Zustand** + persist 落 localStorage
- **AI 调用**：OpenAI 兼容格式，走 `/api/chat/[provider]` Route Handler 代理（key 不暴露浏览器）
- **部署**：Vercel

---

## 三步跑起来

### 1. 安装依赖

> 前置：本机已装 Node.js 18+（含 npm）。

```bash
npm install
```

### 2. 填 API key（两种方式任选其一）

**方式 A · 在 App 内填（推荐 · 个人 MVP）**

`npm run dev` 启动后打开 [http://localhost:3000](http://localhost:3000) → 进入「设置」页 → 在 Kimi / DeepSeek 卡片里填 key。密钥只存浏览器 localStorage，**不会上传 Vercel**。

获取 key：
- **Kimi (Moonshot)**：[platform.moonshot.cn](https://platform.moonshot.cn/) → API Keys
- **DeepSeek**：[platform.deepseek.com](https://platform.deepseek.com/) → API Keys
- **Claude / Midjourney**：MVP 版本 Mock，无需 key（在 v2 启用）

**方式 B · 在 Vercel 环境变量里填**

复制 `.env.example` 为 `.env.local`（本地）或在 Vercel 项目 Settings → Environment Variables 里加：

```
MOONSHOT_API_KEY=sk-...
DEEPSEEK_API_KEY=sk-...
```

Route Handler 优先读 env，没有再读请求体里的 key。两种方式可以混用。

### 3. 启动

```bash
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。

---

## 一键部署到 Vercel

1. 把这个仓库 push 到 GitHub
2. 在 [vercel.com](https://vercel.com) 点 `New Project` → Import 这个 repo
3. （可选）在 Vercel 项目的 Environment Variables 里加 `MOONSHOT_API_KEY` / `DEEPSEEK_API_KEY`
4. 点 `Deploy`，等 1-2 分钟，vercel.app 域名直接可用

`vercel.json` 已配置好（Next.js 框架 + Hong Kong region + /api 路径 no-store）。

---

## 用法

### 工作台（默认页）

- 左侧会话栏：4 个 AI 分组（Kimi 紫 · DeepSeek 蓝 · Claude 珊瑚 · Midjourney 金）
- 中间消息流：发消息后流式接收 AI 回复
- **自动路由**：输入长文本自动交给 Kimi，含「数值/推演」关键词自动交给 DeepSeek，依此类推。在输入栏上方会有「将自动路由：xxx」提示
- **手动切换模型**：点消息流顶部的模型徽章可手动切换
- **上下文预算条**：右上角显示当前会话 token 占用，超过 80k 触发「自动接力」按钮，点击后建新会话并携带前文摘要
- 右侧记忆面板：展示前 5 条记忆，点「查看全部」进记忆库

### 任务调度

在工作台输入栏输入 `/` 开头的描述（例如 `/帮我做一份产品发布会全案`），或点顶栏「任务调度」页 → 新建调度任务。

调度大脑按关键词规则拆解为子任务（不是真调 AI 拆解，避免循环依赖 + 不可控）：
- 含「调研/行业/竞品/材料」→ Kimi 子任务
- 含「推演/数据/定价/策略」→ DeepSeek 子任务
- 含「主视觉/海报/图像」→ Midjourney 子任务
- 含「文案/写作/润色」→ Claude 子任务
- 一个都没匹配 → 默认 Kimi 整理

子任务并行分发，进度条用 `grad-aurora` 渐变，完成后可一键导出全案。

### 记忆库

4 类筛选（项目背景 / 用户偏好 / 关键决策 / 数据资产）。点卡片进详情编辑，可切换分类、删除。右上「导出 JSON」一键导出全部数据。

### 设置

- AI 模型连接：填 key、密钥可见性切换、连接测试（点「连接测试」会真实调一次 `/api/chat/{provider}` 验证）
- 调度偏好：4 个开关（自动接力 / 自动路由 / 自动沉淀 / 价格提醒）
- 数据管理：导出全部、清空所有（清空会移除 localStorage）

---

## 设计约束（不可妥协）

颜色 / 字号 / 间距 / 圆角全部从 `src/styles/tokens.css` 或 `tailwind.config.ts` 取，禁止写死像素值。

AI 配色严格绑定（详见 `FlowHub-设计系统.md` 第 14 条）：

| AI | 颜色 | hex |
|---|---|---|
| Kimi | 紫 | `#9381FF` |
| DeepSeek | 蓝 | `#2EA7FF` |
| Claude | 珊瑚 | `#D97757` |
| Midjourney | 金 | `#F5C542` |

状态色 ≠ 品牌色：青绿 `#13DDC4` = 完成，金色 `#F5C542` = 进行中，灰 `#8E8E9C` = 排队，红 `#FF5C5C` = 错误。

过渡：200ms / `cubic-bezier(0.22, 1, 0.36, 1)`。

---

## 目录结构

```
src/
  app/
    api/chat/[provider]/route.ts   # AI 调用代理（OpenAI 兼容 SSE 流式）
    globals.css
    layout.tsx
    page.tsx                        # AppShell 入口
  components/
    AppShell.tsx                    # 顶栏 + 4 页路由 + 弹层
    TopBar.tsx                      # 顶栏 + 移动底栏
    ui.tsx                          # 共享基础组件（AIDot/Badge/Button/Modal/Toast 等）
    modals.tsx                      # NewTaskModal + MemoryDetailModal + ModalProvider
    workspace/
      SessionList.tsx
      MessageList.tsx
      ContextBudget.tsx             # 上下文预算条 + 接力按钮
      ModelSwitch.tsx
      MemoryPanel.tsx
      ChatInput.tsx                 # 输入栏 + / 触发 + 自动路由 + 流式发送
    pages/
      Workspace.tsx
      Dispatch.tsx
      MemoryLibrary.tsx
      Settings.tsx
  lib/
    types.ts
    ai-meta.ts                      # 4 家 AI 元信息 + 配色绑定
    tokens.ts                       # token 估算
    routing.ts                      # 自动路由 + 任务拆解规则
    store.ts                        # Zustand store + persist + 演示数据
    ai-client.ts                    # 前端流式 fetch 客户端
  styles/
    tokens.css                      # FlowHub 设计 tokens（CSS 变量）
tailwind.config.ts                  # 基于 FlowHub-tailwind.config.js
vercel.json
.env.example
README.md
```

---

## MVP 范围说明

做了：左会话栏 + 4 分组、消息流 + 上下文预算、自动路由、持久记忆库、上下文接力、任务调度（规则拆解）、设置页 + API key 管理。

没做（明确不在 MVP 内）：用户系统、数据库、测试、Claude/Midjourney 真实接入（用 Mock）、AI 真实拆解调度任务（用关键词规则）。

---

## License

MIT · 个人 MVP，自用为主。
