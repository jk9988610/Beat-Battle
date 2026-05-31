import { ADMIN_USER_NAMES, ADMIN_PIN } from './config.js';

const ADMIN_SESSION_KEY = 'beat-battle-admin-session';

function normalizeName(name) {
  return (name || '').trim().toLowerCase();
}

/** 昵称是否在管理员白名单（config.js 中配置） */
export function isAdminByName(name) {
  const n = normalizeName(name);
  return ADMIN_USER_NAMES.some((a) => normalizeName(a) === n);
}

/** 本标签页是否已通过口令验证 */
export function hasAdminSession() {
  return sessionStorage.getItem(ADMIN_SESSION_KEY) === '1';
}

/** 当前登录用户是否为管理员 */
export function isAdmin(user) {
  if (!user) return false;
  if (isAdminByName(user.name)) return true;
  return hasAdminSession();
}

/** 口令验证，成功则本标签页获得管理权限 */
export function tryElevateWithPin(pin) {
  if ((pin || '').trim() === ADMIN_PIN) {
    sessionStorage.setItem(ADMIN_SESSION_KEY, '1');
    return true;
  }
  return false;
}

export function revokeAdminSession() {
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
}

export function assertAdmin(user) {
  if (!isAdmin(user)) {
    throw new Error('需要管理员权限：请使用管理员昵称加入，或输入管理员口令');
  }
}

export function getAdminHint() {
  const names = ADMIN_USER_NAMES.join('、');
  return `管理员昵称：${names}；或向主持人索取口令后在下方验证。`;
}
