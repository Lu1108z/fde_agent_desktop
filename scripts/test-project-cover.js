const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { createCoverService } = require('../src/main/project-cover');

async function run() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fde-cover-test-'));
  const records = { demo: { name: '医院运营智能体' }, second: { name: '学校管理智能体' }, empty: { name: '尚未生成封面的智能体' } };
  let calls = 0, current = 0, peak = 0;
  const service = createCoverService({ root, readProject: slug => records[slug], getConfig: () => ({ apiKey: 'test-key', baseUrl: 'https://model.example/v1', model: 'test-image-model' }), toMediaUrl: async file => { await new Promise(resolve => setTimeout(resolve, 5)); return file; }, decodePng: buffer => buffer.toString() === 'sample-image' ? buffer : null,
    fetchImpl: async (url, options) => {
      assert.equal(String(url), 'https://model.example/v1/images/generations');
      const payload = JSON.parse(options.body);
      assert.equal(payload.model, 'test-image-model'); assert.equal(payload.n, 1);
      assert.ok(payload.prompt.includes('智能体')); assert.equal(payload.quality, 'medium');
      calls++; current++; peak = Math.max(peak, current);
      await new Promise(resolve => setTimeout(resolve, 5)); current--;
      return new Response(JSON.stringify({ data: [{ b64_json: Buffer.from('sample-image').toString('base64') }] }), { status: 200 });
    },
  });
  try {
    assert.equal((await service.get('demo')).missing, true);
    const [first, duplicate, second] = await Promise.all([service.generate('demo'), service.generate('demo'), service.generate('second')]);
    assert.equal(first.url, duplicate.url); assert.notEqual(first.url, second.url); assert.equal(calls, 2); assert.equal(peak, 1);
    assert.equal(fs.readFileSync(first.url, 'utf8'), 'sample-image');
    assert.equal((await service.generate('demo')).url, first.url); assert.equal(calls, 2);
    await service.generate('demo', true); assert.equal(calls, 3);
    records.demo.name = '新项目名称'; assert.equal((await service.get('demo')).url, first.url);
    assert.equal((await service.generate('demo')).url, first.url); assert.equal(calls, 3);
    const restarted = createCoverService({ root, readProject: slug => records[slug], toMediaUrl: async file => file, getConfig: () => { throw Error('Existing covers must not need API configuration'); } });
    assert.equal((await restarted.get('demo')).url, first.url);
    assert.equal((await restarted.generate('demo')).url, first.url);
    await assert.rejects(service.get('../demo')); await assert.rejects(service.get('missing'));
    const failing = createCoverService({ root, readProject: slug => records[slug], getConfig: () => ({ apiKey: 'test', baseUrl: 'https://model.example', model: 'test' }), toMediaUrl: file => file, decodePng: () => null, fetchImpl: async () => new Response('credential details should stay private', { status: 401 }) });
    await assert.rejects(failing.generate('empty'), /HTTP 401/);
    assert.equal((await service.get('empty')).missing, true);
    console.log('✓ 项目封面：已有封面复用、重启与改名缓存、异步图片地址、请求合并和失败处理通过');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
