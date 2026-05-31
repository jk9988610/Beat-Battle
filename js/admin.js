import { getAdminSettings } from './config.js';

const ADMIN_SESSION_KEY = 'beat-battle-admin-session';

function normalizeName(name) {
  return (name || '').trim().toLowerCase();
}

/** 昵称是否在管理员白名单 */
export function isAdminByName(name) {
  const n = normalizeName(name);
  const { userNames } = getAdminSettings();
  return userNames.some((a) => normalizeName(a) === n);
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
  const { pin: expected } = getAdminSettings();
  if ((pin || '').trim() === expected) {
    sessionStorage.setItem(ADMIN_SESSION_KEY, '1');
    return true;
  }
  return false;
}

export function revokeAdminSession() {
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
}

/** 昵称在白名单时，加入后自动获得本标签页管理权限 */
export function grantAdminSessionIfEligible(name) {
  if (isAdminByName(name)) {
    sessionStorage.setItem(ADMIN_SESSION_KEY, '1');
  }
}

export function assertAdmin(user) {
  if (!isAdmin(user)) {
    throw new Error('需要管理员权限：请前往「设置」验证，或使用管理员昵称加入');
  }
}

export function getAdminHint() {
  const { userNames } = getAdminSettings();
  return `管理员昵称：${userNames.join('、')}；或前往「设置」输入口令验证。`;
}
