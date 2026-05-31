/** 为 Promise 增加超时，避免平板/弱网一直卡在加载中 */
export function withTimeout(promise, ms, label = '请求') {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label}超时（${Math.round(ms / 1000)}s）`)), ms);
    }),
  ]);
}
