# 云端音频与作品数据格式

## 当前上传格式（评阅站 / 制作库）

- 存储位置：Supabase Storage 桶 **`audio`**（Public 读）
- 文件本质：**原始音频二进制**，扩展名来自浏览器 `File.type` 或 Blob 类型
  - 常见：`mp3`、`wav`、`ogg`、`m4a`、`webm` 等
- **不是**固定转码格式；上传时保留源 MIME（`contentType`）

### 路径约定

| 用途 | 路径示例 |
|------|----------|
| 赛季参赛作品 | `{seasonId}/{submissionId}.mp3` |
| 制作库发布 | `published/{userId}/{workId}.mp3` |

## 能否上传 JSON？

- **评阅参赛作品**：当前仅支持 **音频文件** 参赛（盲听评阅）。
- **制作库扩展（规划）**：可在 `published_works` 增加 `project_json`（jsonb）或 Storage 路径 `published/{userId}/{id}.json`，保存：
  - 音序（steps、BPM、调性）
  - 段落（sections）
  - 轨道与音符（与 HarmonyForge 工程导出一致）

编曲站导出 JSON + 混音 MP3 后，评阅站可「加载工程预览」；评阅打分仍用音频。需单独开发，数据库可先执行 `schema-v4-project-json.sql`（见仓库）。

## 平板 / 网页开发提示

- 无需本地环境：改代码 push 后 GitHub Pages 部署，顶栏点 **更新** 拉新版本。
