/** 评阅维度与 1–5 分趣味描述 */
export const CRITERIA = [
  {
    id: 'completeness',
    name: '完整度',
    descriptions: {
      1: '像被掐断的直播，关键段落集体失踪。',
      2: '骨架在，血肉多处留白，听得出来没做完。',
      3: '该有的都在，但收尾或过渡还欠一口气。',
      4: '结构完整，起承转合都能对上号。',
      5: '从头到尾严丝合缝，没有「等等刚才那句呢」的遗憾。',
    },
  },
  {
    id: 'fluency',
    name: '流畅度',
    descriptions: {
      1: '卡的像 PPT，一帧一帧往前蹭。',
      2: '磕磕绊绊，像网速只有 2G 的语音通话。',
      3: '大体能听下去，偶尔会有明显的「卡带」感。',
      4: '节奏顺畅，只有极个别小瑕疵。',
      5: '行云流水，听不出任何人为的停顿或断裂。',
    },
  },
  {
    id: 'comfort',
    name: '舒适度',
    descriptions: {
      1: '刺耳到想摘耳机，像指甲划黑板。',
      2: '听着费劲，音量或音色让人不太想继续。',
      3: '能接受，但谈不上享受，偏「完成任务」。',
      4: '听着舒服，愿意把这一段听完。',
      5: '耳朵被温柔对待，想单曲循环当背景音。',
    },
  },
  {
    id: 'expression',
    name: '表现力',
    descriptions: {
      1: '像念说明书，情绪 flat 到可以当地板。',
      2: '有起伏但像机器人练习「开心」和「难过」。',
      3: '能传达基本情绪，但记忆点不多。',
      4: '感染力在线，能跟着情绪走一程。',
      5: '开口就有画面感，听完还想回味那个语气。',
    },
  },
  {
    id: 'production',
    name: '制作质量',
    descriptions: {
      1: '底噪开会，像在老式收音机里录的。',
      2: '能听清内容，但混响、爆音或剪辑痕迹明显。',
      3: '及格线作品，不惊艳也不劝退。',
      4: '干净清晰，细节处理看得出用心。',
      5: '专业棚质感，每个频段都在它该在的地方。',
    },
  },
];

export const CRITERIA_IDS = CRITERIA.map((c) => c.id);

export function getCriterion(id) {
  return CRITERIA.find((c) => c.id === id);
}

export function averageScores(scoresByCriterion) {
  const values = CRITERIA_IDS.map((id) => scoresByCriterion[id]).filter(
    (v) => typeof v === 'number' && !Number.isNaN(v)
  );
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
