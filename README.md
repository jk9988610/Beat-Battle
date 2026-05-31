# Beat Battle · 音频评阅

盲听音频评阅 Web 应用：上传作品、互相评阅、赛季排名。**支持 Supabase 云同步**，编曲制作页可通过 SDK 直传，无需导出 JSON。

**在线访问**：https://jk9988610.github.io/Beat-Battle/

## 云同步（一次性配置）

多人（甲、乙、丙）自动看到彼此上传与评分，需免费 [Supabase](https://supabase.com) 项目：

1. 新建项目 → **SQL Editor** 运行 [`supabase/schema.sql`](supabase/schema.sql)
2. **Storage** → 新建 bucket：`audio`，勾选 **Public**
3. **Project Settings → API** 复制 URL 与 `anon` `public` key
4. 评阅站主页 → **云同步** → 粘贴并「保存并连接」
5. 制作页使用相同 URL/key，见 [`docs/integrate-production.md`](docs/integrate-production.md)

配置完成后：

- 甲上传 → 乙、丙打开评阅站**自动**出现待评作品（Realtime）
- 制作页 `BeatBattle.uploadAudio(blob)` → 同上，无需导入文件

## 功能

- 盲评（不显示文件名与作者）
- 五维 1–5 分趣味描述
- 不评阅自己作品
- 赛季制与排名揭晓
- 未配置云同步时仍可用本机存储 + 导出/导入备份

## 制作页 SDK 示例

```html
<script type="module">
  import { BeatBattle } from 'https://jk9988610.github.io/Beat-Battle/js/beat-battle-sdk.js';

  await BeatBattle.init({
    supabaseUrl: 'https://你的项目.supabase.co',
    supabaseAnonKey: '你的 anon key',
    userName: '甲',
  });

  const blob = await myExporter(); // 你页面已有的导出
  await BeatBattle.uploadAudio(blob);
</script>
```

## 本地预览

```bash
python3 -m http.server 8080
```

## 技术栈

- 静态 SPA + Supabase（Postgres + Storage + Realtime）
- GitHub Pages 部署
