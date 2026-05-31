// 在 js/app.js 的 init() 末尾加入（需已加载 project-io.js、audio-export.js、beat-battle-cloud.js）：

if (typeof BeatBattleCloud !== "undefined") {
  BeatBattleCloud.initUI({ getProjectData, setStatus });
}

// 若你仍在 app.js 里手写 bbPublishConfirm / BeatBattleCloud.publishWork，
// 请删除那段旧逻辑，避免重复绑定发布按钮。
