# 编曲制作页接入 Beat Battle 直传

配置好 [Supabase 云同步](../README.md#云同步一次性配置) 后，制作页**无需**再导出 JSON 到评阅站导入；调用 SDK 即可把成品直传到当前赛季。

## 1. 与评阅站共用 Supabase

制作页 `init` 时填入与评阅站「云同步设置」**相同**的 URL 与 anon key，并使用**相同昵称**。

## 2. 引入 SDK（ES Module）

```html
<script type="module">
  import { BeatBattle } from 'https://jk9988610.github.io/Beat-Battle/js/beat-battle-sdk.js';

  const SUPABASE_URL = 'https://你的项目.supabase.co';
  const SUPABASE_ANON_KEY = '你的 anon key';

  document.getElementById('btn-submit-battle').addEventListener('click', async () => {
    await BeatBattle.init({
      supabaseUrl: SUPABASE_URL,
      supabaseAnonKey: SUPABASE_ANON_KEY,
      userName: '甲', // 与评阅站登录昵称一致
    });

    // 从制作页导出：Blob / ArrayBuffer / MediaRecorder 结果均可
    const blob = await exportMyBeatAsWav(); // 你页面已有的导出函数
    const projectJson = buildYourProjectBundle(); // 与 .hfproj 导出结构一致
    const { submissionId } = await BeatBattle.uploadAudio(blob, undefined, projectJson);
    alert('已提交到 Beat Battle，作品编号：' + submissionId.slice(0, 8));
  });
</script>
```

## 3. 典型流程（甲乙丙）

1. 主持人在评阅站配置 Supabase，阶段设为「上传作品」
2. 甲在制作页点「提交参赛」→ SDK 上传 → 云端已有作品
3. 乙、丙打开评阅站，**自动**在「开始评阅」中看到甲的作品（实时同步）
4. 评阅结束、揭晓后，甲在「赛季排名」查看均分

## 4. 本地开发

若制作页在 `localhost`，注意 Supabase Storage 的 CORS；在 Supabase Dashboard → Storage → audio → Configuration 允许你的本地域名。

## 5. 无云同步时

未配置 Supabase 时，制作页仍只能走评阅站页内上传，或使用导出/导入 JSON（旧流程）。


## 6. 制作库发布（含编曲 JSON）

```javascript
import { BeatBattle } from '.../beat-battle-sdk.js';
await BeatBattle.init({ ... });
await BeatBattle.publishWork({
  userId, userName, title,
  audioBlob,
  projectJson: harmonyForgeBundle,
});
```
