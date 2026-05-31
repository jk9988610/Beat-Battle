/**
 * HarmonyForge ↔ Beat Battle 云发布与会话（与评阅站同域 localStorage）
 */
const BeatBattleCloud = (() => {
  const BEAT_BATTLE_URL = "https://jk9988610.github.io/Beat-Battle/";
  const LS_SESSION = "beat-battle-cloud-session";
  const LS_CLOUD_CONFIG = "beat-battle-cloud-config";

  const DEFAULT_CLOUD_CONFIG = {
    url: "https://yjqkotqmglxjhlrhynsu.supabase.co",
    anonKey:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqcWtvdHFtZ2x4amhscmh5bnN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxOTMzNDQsImV4cCI6MjA5NTc2OTM0NH0.Cm4WjiR4NXS4RrA15frLVMZPbGUyGyjaIYQXSRua8Ew",
  };

  let client = null;
  let cachedUser = null;

  function getCloudConfig() {
    try {
      const raw = localStorage.getItem(LS_CLOUD_CONFIG);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.url && parsed?.anonKey) return parsed;
      }
    } catch {
      /* ignore */
    }
    if (DEFAULT_CLOUD_CONFIG.url && DEFAULT_CLOUD_CONFIG.anonKey) {
      return { ...DEFAULT_CLOUD_CONFIG };
    }
    return { url: "", anonKey: "" };
  }

  function isCloudEnabled() {
    const c = getCloudConfig();
    return Boolean(c.url && c.anonKey);
  }

  function loadSession() {
    try {
      const raw = localStorage.getItem(LS_SESSION);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.userId && parsed?.userName) return parsed;
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  function saveSession({ userId, userName }) {
    if (!userId || !userName) return;
    localStorage.setItem(
      LS_SESSION,
      JSON.stringify({ userId, userName, savedAt: Date.now() })
    );
    localStorage.setItem("beat-battle-current-user-id", userId);
  }

  async function loadSupabase() {
    const { createClient } = await import(
      "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm"
    );
    return createClient;
  }

  async function ensureClient() {
    if (!isCloudEnabled()) {
      throw new Error("云同步未配置，请先在评阅站完成云同步设置");
    }
    if (!client) {
      const createClient = await loadSupabase();
      const { url, anonKey } = getCloudConfig();
      client = createClient(url, anonKey);
    }
    return client;
  }

  async function findOrCreateUser(name) {
    const sb = await ensureClient();
    const trimmed = name.trim();
    const { data: existing } = await sb.from("users").select("*").eq("name", trimmed).maybeSingle();
    if (existing) return existing;
    const { data, error } = await sb.from("users").insert({ name: trimmed }).select().single();
    if (error) throw error;
    return data;
  }

  async function ensureUser(userName) {
    const session = loadSession();
    if (session?.userId && session?.userName) {
      if (!userName || session.userName === userName.trim()) {
        cachedUser = { id: session.userId, name: session.userName };
        return cachedUser;
      }
    }
    const name = (userName || session?.userName || "").trim();
    if (!name) throw new Error("请先在评阅站加入赛季，或填写参赛者昵称");
    const user = await findOrCreateUser(name);
    saveSession({ userId: user.id, userName: user.name });
    cachedUser = { id: user.id, name: user.name };
    return cachedUser;
  }

  const MAX_PROJECT_JSON_BYTES = 2 * 1024 * 1024;

  async function uploadAudioToCloud(path, blob) {
    const sb = await ensureClient();
    const { error } = await sb.storage.from("audio").upload(path, blob, {
      upsert: true,
      contentType: blob.type || "audio/mpeg",
    });
    if (error) throw error;
    return path;
  }

  /** 与 Beat Battle project-json-utils 一致：bundle 或裸 project */
  function normalizeProjectJsonPayload(data) {
    if (!data || typeof data !== "object") {
      throw new Error("编曲工程内容无效");
    }
    if (data.harmonyforge != null && data.project) return data;
    if (data.sequencer || data.arranger) {
      return {
        harmonyforge: 2,
        kind: "project",
        project: data,
      };
    }
    throw new Error("不是有效的 HarmonyForge 编曲工程");
  }

  function buildPublishProjectJson(project, meta = {}) {
    if (typeof ProjectIO !== "undefined" && ProjectIO.buildBundle) {
      return normalizeProjectJsonPayload(ProjectIO.buildBundle(project, meta));
    }
    return normalizeProjectJsonPayload({
      harmonyforge: 2,
      kind: "project",
      meta: { exportedAt: new Date().toISOString(), ...meta },
      project,
    });
  }

  async function publishWork({ title, audioBlob, userName, projectJson }) {
    const user = await ensureUser(userName);
    if (!title?.trim()) throw new Error("请填写作品标题");
    if (!(audioBlob instanceof Blob)) throw new Error("音频无效");

    let jsonPayload = null;
    if (projectJson != null) {
      jsonPayload = normalizeProjectJsonPayload(projectJson);
      const bytes = new TextEncoder().encode(JSON.stringify(jsonPayload)).length;
      if (bytes > MAX_PROJECT_JSON_BYTES) {
        throw new Error(
          `编曲 JSON 过大（${Math.round(bytes / 1024)}KB，上限 ${MAX_PROJECT_JSON_BYTES / 1024 / 1024}MB）`
        );
      }
    }

    const workId = crypto.randomUUID();
    const ext = (audioBlob.type || "audio/mpeg").split("/")[1]?.split(";")[0] || "mp3";
    const audioPath = `published/${user.id}/${workId}.${ext}`;
    await uploadAudioToCloud(audioPath, audioBlob);

    const insertRow = {
      id: workId,
      user_id: user.id,
      user_name: user.name,
      title: title.trim(),
      audio_path: audioPath,
    };
    if (jsonPayload) insertRow.project_json = jsonPayload;

    const sb = await ensureClient();
    const { data, error } = await sb.from("published_works").insert(insertRow).select().single();
    if (error) throw error;
    return {
      id: data.id,
      title: data.title,
      userName: data.user_name,
      publishedAt: new Date(data.published_at).getTime(),
      hasProjectJson: data.project_json != null,
    };
  }

  function syncHeaderBadge() {
    const badge = document.getElementById("reviewSessionBadge");
    const nameEl = document.getElementById("reviewSessionName");
    const session = loadSession();
    if (!badge || !nameEl) return;
    if (session?.userName) {
      badge.hidden = false;
      nameEl.textContent = session.userName;
      badge.title = `评阅站昵称：${session.userName}`;
    } else {
      badge.hidden = true;
      nameEl.textContent = "—";
    }
  }

  function initUI({ getProjectData, setStatus }) {
    syncHeaderBadge();
    window.addEventListener("storage", (e) => {
      if (e.key === LS_SESSION) syncHeaderBadge();
    });

    const link = document.getElementById("linkBeatBattle");
    if (link) link.href = BEAT_BATTLE_URL;

    const btnPublish = document.getElementById("btnPublish");
    const publishDialog = document.getElementById("publishDialog");
    const publishForm = document.getElementById("publishForm");
    const publishTitle = document.getElementById("publishTitle");
    const publishNickname = document.getElementById("publishNickname");

    if (!btnPublish || !publishDialog) return;

    const session = loadSession();
    if (publishNickname && session?.userName) {
      publishNickname.value = session.userName;
      publishNickname.disabled = true;
    }

    btnPublish.addEventListener("click", () => {
      const s = loadSession();
      if (publishTitle) publishTitle.value = "";
      if (publishNickname) {
        publishNickname.value = s?.userName || "";
        publishNickname.disabled = Boolean(s?.userName);
      }
      publishDialog.showModal();
    });

    if (publishForm) {
      publishForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const submitter = e.submitter;
        if (!submitter || submitter.value !== "ok") {
          publishDialog.close();
          return;
        }
        const title = publishTitle?.value?.trim();
        const nick = publishNickname?.value?.trim();
        publishDialog.close();
        try {
          if (!isCloudEnabled()) {
            throw new Error("云同步未配置，请先在评阅站打开「设置」完成云同步");
          }
          if (typeof getProjectData !== "function") {
            throw new Error("无法读取当前工程");
          }
          if (typeof AudioExport === "undefined" || !AudioExport.renderExportBlob) {
            throw new Error("音频导出模块未加载");
          }
          setStatus?.("正在渲染音频与工程 JSON，并发布到制作库…");
          btnPublish.disabled = true;
          const project = getProjectData();
          const projectJson = buildPublishProjectJson(project, {
            title,
            source: "publish",
          });
          const blob = await AudioExport.renderExportBlob(project, "mp3");
          const work = await publishWork({
            title,
            audioBlob: blob,
            userName: nick,
            projectJson,
          });
          const jsonNote = work.hasProjectJson ? "（含编曲 JSON）" : "";
          AppLogger.info("已发布到制作库", `${work.title} · ${work.id.slice(0, 8)}${jsonNote}`);
          setStatus?.(`已发布「${work.title}」${jsonNote} — 请到评阅站制作库提交参赛`);
          syncHeaderBadge();
        } catch (err) {
          AppLogger.error("发布失败", err.message);
          setStatus?.("发布失败：" + err.message);
          alert("发布失败：\n" + err.message);
        } finally {
          btnPublish.disabled = false;
        }
      });
    }
  }

  return {
    BEAT_BATTLE_URL,
    loadSession,
    saveSession,
    isCloudEnabled,
    ensureUser,
    publishWork,
    buildPublishProjectJson,
    syncHeaderBadge,
    initUI,
  };
})();
