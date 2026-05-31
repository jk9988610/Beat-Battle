# 编曲站（Music-production-website）接入说明

**独立仓库**，与 [Beat-Battle](https://github.com/jk9988610/Beat-Battle) 不共用 Git，但共用同一 Supabase 项目。

## 最快方式（推荐）

若你的编曲站就是 `jk9988610/Music-production-website`，**main 上已有完整实现**（提交 `cce482a` / v2.0.6）：

```bash
git pull origin main
git push origin main   # 触发 GitHub Pages
```

无需再改代码，拉取后部署即可。

## 手动合并（旧版仓库）

将本目录文件覆盖到你的编曲站仓库对应路径：

| 本目录 | 你的仓库 |
|--------|----------|
| `js/beat-battle-cloud.js` | `js/beat-battle-cloud.js` |

并在 `js/app.js` 的 `init()` 末尾保留：

```javascript
if (typeof BeatBattleCloud !== "undefined") {
  BeatBattleCloud.initUI({ getProjectData, setStatus });
}
```

`index.html` 需有：

- `id="btnPublish"` 顶栏发布按钮
- `id="publishDialog"` / `id="publishForm"` / `publishTitle` / `publishNickname`
- `<script src="js/beat-battle-cloud.js"></script>`（在 `app.js` 之前）

可参考线上仓库 `index.html` 中「发布到制作库」对话框整段。

## Supabase（与评阅站相同，执行一次）

```sql
alter table published_works add column if not exists project_json jsonb;
alter table submissions add column if not exists project_json jsonb;
```

## 验证

发布后在 Supabase：

```sql
select title, (project_json is not null) as has_json
from published_works order by published_at desc limit 5;
```

评阅站 v1.9.4+ 制作库应显示「含编曲工程」。
