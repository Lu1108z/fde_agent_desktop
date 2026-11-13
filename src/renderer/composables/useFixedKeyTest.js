import { ref, watch } from 'vue';
import { FIXED_GATEWAY, FIXED_MODELS } from '../constants/models.js';

// 测试结果只属于发起测试时的 Key；两种固定模型分别检测。
export function useFixedKeyTest(getKey) {
  const testing = ref(false), testResult = ref(null);
  let revision = 0;
  watch(getKey, () => { revision++; testResult.value = null; }, { flush: 'sync' });
  async function testConn() {
    const key = getKey().trim();
    if (!key || testing.value) return;
    const requestRevision = revision;
    testing.value = true; testResult.value = null;
    try {
      const results = await Promise.all(FIXED_MODELS.map(async model => {
        try {
          const result = await window.api.env.testConnection({ apiKey: key, baseUrl: FIXED_GATEWAY.baseUrl, model: model.id, stripVendorPrefix: false, apiMode: FIXED_GATEWAY.apiMode, authMode: 'bearer', extraHeaders: {} });
          return { ...result, label: model.label, ok: result?.ok === true };
        } catch (error) { return { label: model.label, ok: false, error: error.message }; }
      }));
      if (requestRevision !== revision || key !== getKey().trim()) return;
      const ok = results.every(result => result.ok);
      testResult.value = { ok, message: results.map(result => `${result.label}：${result.ok ? `连接正常（${result.latencyMs ?? '—'}ms）` : result.error || '连接失败'}`).join('；') };
    } finally { testing.value = false; }
  }
  return { testing, testResult, testConn };
}
