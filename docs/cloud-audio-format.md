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

## 编曲工程 JSON

- **制作库**（`published_works.project_json`）：编曲站发布到制作库时**自动附带**当前工程 bundle（HarmonyForge `.hfproj` 结构）。
- **参赛作品**（`submissions.project_json`）：本地上传可选 `.json` / `.hfproj`；从制作库提交参赛时会一并复制工程 JSON。
- **评阅**：盲听仍仅播放音频，工程 JSON 供存档与后续功能使用。

数据库：执行 `schema-v4-project-json.sql` 与 `schema-v5-submission-project-json.sql`。

## 平板 / 网页开发提示

- 无需本地环境：改代码 push 后 GitHub Pages 部署，顶栏点 **更新** 拉新版本。
