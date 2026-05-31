/**
 * Beat Battle 上传 SDK — 供编曲制作页等外部页面调用
 *
 * 示例（制作页与评阅站使用同一 Supabase 项目）：
 *
 * import { BeatBattle } from 'https://jk9988610.github.io/Beat-Battle/js/beat-battle-sdk.js';
 *
 * await BeatBattle.init({
 *   supabaseUrl: 'https://xxx.supabase.co',
 *   supabaseAnonKey: 'eyJ...',
 *   userName: '甲',
 * });
 * await BeatBattle.uploadAudio(wavBlob); // 或 export 得到的 Blob
 */
import { setCloudConfig, isCloudEnabled, getCloudConfig, DEFAULT_CLOUD_CONFIG } from './config.js';
import {
  initCloud,
  findOrCreateUser,
  createSubmission,
  ensureRemoteSeason,
  setCurrentUserId,
  fetchRemoteState,
} from './remote.js';

let cachedUser = null;
let cachedSeasonId = 1;

export const BeatBattle = {
  /**
   * @param {object} opts
   * @param {string} opts.supabaseUrl
   * @param {string} opts.supabaseAnonKey
   * @param {string} opts.userName 参赛者昵称（与评阅站一致）
   * @param {number} [opts.seasonId] 赛季 ID，默认当前最新赛季
   */
  async init(opts = {}) {
    const url = opts.supabaseUrl || DEFAULT_CLOUD_CONFIG.url || getCloudConfig().url;
    const anonKey =
      opts.supabaseAnonKey || DEFAULT_CLOUD_CONFIG.anonKey || getCloudConfig().anonKey;
    if (!url || !anonKey) {
      throw new Error('请提供 supabaseUrl 与 supabaseAnonKey，或在 Beat-Battle config.js 中预置');
    }
    if (!opts?.userName?.trim()) {
      throw new Error('请提供 userName');
    }
    setCloudConfig({ url, anonKey });
    initCloud();
    const state = await fetchRemoteState();
    cachedSeasonId = opts.seasonId ?? state?.currentSeasonId ?? 1;
    await ensureRemoteSeason(cachedSeasonId);
    const user = await findOrCreateUser(opts.userName.trim());
    cachedUser = user;
    setCurrentUserId(user.id);
    return { userId: user.id, seasonId: cachedSeasonId, userName: user.name };
  },

  /** 是否已配置云同步 */
  isReady() {
    return isCloudEnabled() && cachedUser != null;
  },

  /**
   * 从制作页直接上传作品（自动进入云端，评阅站实时可见）
   * @param {Blob} audioBlob
   * @param {string} [mimeType]
   */
  async uploadAudio(audioBlob, mimeType) {
    if (!this.isReady()) {
      throw new Error('请先调用 BeatBattle.init()');
    }
    if (!(audioBlob instanceof Blob)) {
      throw new Error('audioBlob 必须是 Blob');
    }
    const blob =
      mimeType && !audioBlob.type
        ? new Blob([audioBlob], { type: mimeType })
        : audioBlob;
    const sub = await createSubmission(cachedSeasonId, cachedUser.id, blob);
    return { submissionId: sub.id, seasonId: cachedSeasonId };
  },

  /** 获取当前赛季 ID */
  getSeasonId() {
    return cachedSeasonId;
  },

  getUser() {
    return cachedUser;
  },
};

export default BeatBattle;
