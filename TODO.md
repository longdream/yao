# TODO

- [ ] Windows 上执行 `start.bat` 验证开发环境启动（首次会自动安装依赖并拉起 Tauri dev）
- [ ] 在设置中切换 Provider，分别验证 Ollama `/api/tags` 与 OpenAI `/v1/models` 获取模型列表
- [ ] 进行一次对话，确认流式打字机与 2px 灰色光标显示正常
- [ ] 执行 `build.bat` 生成安装包，检查 `dist/` 是否出现 `.exe`（Windows）
- [ ] 可选：后续将流式改为事件推送（Tauri 事件）以更顺滑
- [ ] Windows 图标：已在构建时自动生成占位 `icons/icon.ico`，后续可替换为真实产品图标
- [ ] 修复 Tauri 开发模式：添加 `devUrl` 并将 `frontendDist` 指向 `../dist`，避免路径不存在
- [ ] 修复 plugin-store 配置：删除 `tauri.conf.json` 中 `plugins.store`，按 Tauri 2 规范省略配置
- [ ] 修复 Tailwind @apply 错误：移除 `bg-gray-900/92`，改用 `filter: brightness(0.92)` 实现 hover 8% 遮罩
- [ ] 资源整理：将 `yaologo-1.png` 统一放到 `public/images/yaologo-1.png` 并删除根目录重复文件

