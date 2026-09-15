# DeepSeek Harness 自研插件扩展集 (Custom Plugins)

本项目提供了一套专为 DeepSeek Harness Web 运行环境定制的增强插件与配置示例。

---

## 插件清单

### 1. `auto-auth.mjs` (自动免密登录与固定 Token 插件)
- **注入服务**：Cordis `connection`
- **解决痛点**：
  - 原生 DSH Web 每次重启都会生成随机 LaunchToken，在守护进程（如 PM2）或开机启动后，直接访问网页会被鉴权拦截，必须重新复制控制台/日志中的 Token。
- **核心功能**：
  - **固定 Token 支持**：支持在配置中指定 `fixedToken` 或环境变量 `DSH_TOKEN`，覆盖默认随机 Token。
  - **免密自动无感登录**：当本地浏览器（`GET /` 或 `GET /index.html`）未认证且 URL 中无 Token 时，自动注入 LaunchToken 进行重定向并签发 Session Cookie，实现直接在浏览器打开网址即可登录。

### 2. `custom-web-search.mjs` (统一中继多引擎联网检索插件)
- **注入服务**：Cordis `web`，注册 `relay-search` Provider
- **解决痛点**：
  - 原生搜索依赖官方渠道。本插件支持接入自建/第三方统一中继（如 `https://cliapi.supersyj.com/v1`），支持多模型与多格式。
- **核心功能**：
  - **Gemini Google Search Grounding**：自动解析 `groundingMetadata.groundingChunks` 提取搜索来源。
  - **Messages Web Search 格式**：支持 Grok / GPT 类模型的 `web_search_20250305` 检索工具与结果解析。
  - **正文超链接智能提取**：从模型回答正文中自动提取 Markdown 格式链接并去重。
  - **高可用故障转移与超时控制**：主模型调用超时（25s）或报错时，自动无缝降级到配置的备选模型列表。
  - **多层级 Key 自动解析**：依次探测配置 `apiKey` -> Cordis credentials -> 环境变量 `CPA_API_KEY` / `DEEPSEEK_API_KEY` -> `~/.dsh/.credentials.yaml`。

---

## 安装与配置方式

1. 将本目录下的插件复制至 `~/.dsh/profiles/web/plugins/`：
   ```bash
   cp auto-auth.mjs ~/.dsh/profiles/web/plugins/
   cp custom-web-search.mjs ~/.dsh/profiles/web/plugins/
   ```
2. 参考 `cordis.patch.example.yml`，编辑或创建 `~/.dsh/profiles/web/cordis.patch.yml`。
3. 重启 `dsh web` 或 PM2 托管的 `dsh-web` 即可生效。
