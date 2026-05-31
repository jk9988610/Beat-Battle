# 编曲站 ↔ 评阅站云端联动（v1.6.0）

HarmonyForge（编曲站）与 Beat Battle（评阅站）通过 **同一 Supabase 项目** 与 **同域 localStorage 会话** 联动。

## 前置条件

1. 在 Supabase 执行 `supabase/schema.sql`（评阅站基础表）
2. 再执行 `supabase/schema-v2-published-works.sql`（制作库 `published_works` 表）
3. Storage 创建 **Public** 桶 `audio`（与评阅站一致）

## 用户流程

1. 在 **评阅站** 输入昵称加入赛季 → 写入 `beat-battle-cloud-session`
2. 主页点击 **前往编曲** → 打开 HarmonyForge
3. 编曲完成后点 **发布** → 音频存入 `audio/published/{userId}/…`，元数据写入 `published_works`
4. 回到评阅站 **上传作品** → 切到 **制作库** 标签 → 试听并 **提交参赛**
5. 评阅站将制作库音频复制到当季 `submissions` 路径，他人可盲听评阅

## 关键模块

| 文件 | 作用 |
|------|------|
| `js/session.js` | `MUSIC_PROD_URL` / `BEAT_BATTLE_URL`，`saveSession` / `loadSession` / `clearSession` |
| `js/published-works.js` | `listPublishedWorks`、`publishWork`、`createSubmissionFromPublished` |
| `js/remote.js` | `getPublicAudioUrl` 获取 Storage 公开 URL |

## 编曲站侧

见 Music-production-website 的 `js/beat-battle-cloud.js`：`window.BeatBattleCloud` 读写同一会话键并调用 Supabase 发布作品。

## 本地联调

两站若部署在不同 origin，会话键不共享；GitHub Pages 上均为 `jk9988610.github.io` 子路径，可共享 localStorage。

## 版本

- Beat Battle **1.6.0**
- HarmonyForge **1.1.0**（Beat Battle 云发布）
