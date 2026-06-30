/**
 * ai/model-manager AIModelManager 内存注册表直接单测
 *
 * 覆盖目标：src/lib/ai/model-manager.ts。该模块为纯内存态的 AI 模型注册表/调用器
 * （仅 import types，无运行时外部依赖），含以下关键控制流：
 * - registerModel：写入 Map；若 isDefault=true 则同步设置 defaultModelId（不分 status）
 * - getDefaultModel(type?)：三级回退——有 type 时「该类型首个 isDefault || 该类型首个 active」；
 *   无 type 时「defaultModelId 命中 || 首个 active 模型」
 * - getModelsByType：仅返回 type 匹配且 status=active 的模型
 * - updateModel：未命中返回 false；命中则浅合并 + updatedAt=new Date()
 * - deleteModel：透传 Map.delete 的布尔结果
 * - setDefaultModel：未命中/非 active 返回 false；命中则先清空其他模型 isDefault 再置目标为默认
 * - testModel：未命中返回 {success:false,error}；命中 await setTimeout(100) 后返回 {success:true,latency}
 * - recordUsage：累加 total*、quotaUsed，并按 model/feature/day 三维分桶（byDay 同日累加、跨日新增）
 * - getUsageStatistics：返回顶层浅拷贝（{...stats}），只读不改内部统计
 * - checkQuota：available = quotaUsed < quotaLimit；remaining = Math.max(0, limit-used)
 * - resetDailyQuota：quotaUsed 清零、quotaResetAt=new Date()，不影响 total 与各分桶
 * - generateText/generateEmbedding：模型解析（modelId 优先，否则 getDefaultModel(type)）；无模型抛错；
 *   tokens=ceil(len/4)、cost=(tokens/1000)*(costPer1kTokens||0)；副作用 recordUsage
 * - createChatSession/sendChatMessage：id 用 `chat-/msg-${Date.now()}`；sendChatMessage 无模型抛错
 * - getSupportedFeatures：所有 active 模型 capabilities 的 Set 去重并集；inactive 不计入
 * - isFeatureAvailable：基于 getSupportedFeatures 的 includes
 *
 * 状态策略：每个用例 `new AIModelManager()` 取全新实例，避免单例状态串扰；testModel/createChatSession/
 * sendChatMessage/byDay 跨日等依赖 Date.now()/new Date() 的用例用 vi.useFakeTimers() 固定时刻。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AIModelManager, aiModelManager } from '@/lib/ai/model-manager';
import type { AIModelConfig } from '@/lib/ai/types';

// 基准时刻：2026-07-01 10:00:00 UTC（toISOString → "2026-07-01T10:00:00.000Z"，日期 "2026-07-01"）
const NOW = new Date('2026-07-01T10:00:00Z');
const NOW_TS = NOW.getTime();

/** 构造一个完整 AIModelConfig，overrides 覆盖默认值 */
function makeModel(overrides: Partial<AIModelConfig> & { id: string }): AIModelConfig {
  return {
    name: overrides.name ?? `model-${overrides.id}`,
    type: overrides.type ?? 'text_generation',
    provider: overrides.provider ?? 'openai',
    modelName: overrides.modelName ?? `model-name-${overrides.id}`,
    status: overrides.status ?? 'active',
    capabilities: overrides.capabilities ?? ['文本生成'],
    createdAt: overrides.createdAt ?? new Date('2026-01-01T00:00:00Z'),
    updatedAt: overrides.updatedAt ?? new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as AIModelConfig;
}

describe('ai/model-manager AIModelManager', () => {
  let mgr: AIModelManager;

  beforeEach(() => {
    mgr = new AIModelManager();
  });

  // ─── 单例导出 ───────────────────────────────────────────

  describe('单例导出', () => {
    it('aiModelManager 为 AIModelManager 实例', () => {
      expect(aiModelManager).toBeInstanceOf(AIModelManager);
    });
  });

  // ─── registerModel / getModel / getAllModels ─────────────

  describe('registerModel / getModel / getAllModels', () => {
    it('registerModel 后 getModel 返回该模型（同引用）', () => {
      const m = makeModel({ id: 'm1' });
      mgr.registerModel(m);
      expect(mgr.getModel('m1')).toBe(m);
    });

    it('getModel 未命中返回 undefined', () => {
      expect(mgr.getModel('nope')).toBeUndefined();
    });

    it('isDefault=true 时同步设置 defaultModelId（getDefaultModel 无参命中）', () => {
      mgr.registerModel(makeModel({ id: 'm1', isDefault: true }));
      expect(mgr.getDefaultModel()?.id).toBe('m1');
    });

    it('isDefault 未设置时 getDefaultModel 无参回退「首个 active」', () => {
      mgr.registerModel(makeModel({ id: 'm1' }));
      expect(mgr.getDefaultModel()?.id).toBe('m1');
    });

    it('isDefault=true 但 status=inactive 仍设置 defaultModelId（锁 registerModel 不校验 status 的行为）', () => {
      mgr.registerModel(makeModel({ id: 'm1', isDefault: true, status: 'inactive' }));
      // getDefaultModel() 无参直接 models.get(defaultModelId)，返回 inactive 模型（未走 active 过滤）
      expect(mgr.getDefaultModel()?.id).toBe('m1');
      expect(mgr.getDefaultModel()?.status).toBe('inactive');
    });

    it('同 id 重复 registerModel 覆盖旧条目', () => {
      mgr.registerModel(makeModel({ id: 'm1', name: 'old' }));
      mgr.registerModel(makeModel({ id: 'm1', name: 'new' }));
      expect(mgr.getModel('m1')?.name).toBe('new');
      expect(mgr.getAllModels()).toHaveLength(1);
    });

    it('getAllModels 返回所有已注册模型（按插入顺序）', () => {
      mgr.registerModel(makeModel({ id: 'm1' }));
      mgr.registerModel(makeModel({ id: 'm2' }));
      mgr.registerModel(makeModel({ id: 'm3' }));
      expect(mgr.getAllModels().map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
    });

    it('getAllModels 空注册表返回空数组', () => {
      expect(mgr.getAllModels()).toEqual([]);
    });
  });

  // ─── getModelsByType ─────────────────────────────────────

  describe('getModelsByType', () => {
    it('仅返回 type 匹配且 status=active 的模型', () => {
      mgr.registerModel(makeModel({ id: 't1', type: 'text_generation' }));
      mgr.registerModel(
        makeModel({ id: 't2', type: 'text_generation', status: 'inactive' })
      );
      mgr.registerModel(makeModel({ id: 'e1', type: 'text_embedding' }));
      expect(mgr.getModelsByType('text_generation').map((m) => m.id)).toEqual(['t1']);
    });

    it('无匹配返回空数组', () => {
      mgr.registerModel(makeModel({ id: 't1', type: 'text_generation' }));
      expect(mgr.getModelsByType('text_embedding')).toEqual([]);
    });
  });

  // ─── getDefaultModel 回退链 ───────────────────────────────

  describe('getDefaultModel 回退链', () => {
    it('无 type、无 defaultModelId：返回首个 active 模型', () => {
      mgr.registerModel(makeModel({ id: 'm1', status: 'inactive' }));
      mgr.registerModel(makeModel({ id: 'm2' }));
      mgr.registerModel(makeModel({ id: 'm3' }));
      expect(mgr.getDefaultModel()?.id).toBe('m2');
    });

    it('无 type、有 defaultModelId：返回该默认模型', () => {
      mgr.registerModel(makeModel({ id: 'm1' }));
      mgr.registerModel(makeModel({ id: 'm2', isDefault: true }));
      expect(mgr.getDefaultModel()?.id).toBe('m2');
    });

    it('无 type、空注册表：返回 undefined', () => {
      expect(mgr.getDefaultModel()).toBeUndefined();
    });

    it('无 type、仅有 inactive 模型：返回 undefined（find active 无命中）', () => {
      mgr.registerModel(makeModel({ id: 'm1', status: 'inactive' }));
      expect(mgr.getDefaultModel()).toBeUndefined();
    });

    it('有 type：返回该类型首个 isDefault 模型', () => {
      mgr.registerModel(makeModel({ id: 'm1', type: 'text_generation' }));
      mgr.registerModel(
        makeModel({ id: 'm2', type: 'text_generation', isDefault: true })
      );
      expect(mgr.getDefaultModel('text_generation')?.id).toBe('m2');
    });

    it('有 type、无 isDefault：返回该类型首个 active 模型', () => {
      mgr.registerModel(makeModel({ id: 'm1', type: 'text_generation' }));
      mgr.registerModel(makeModel({ id: 'm2', type: 'text_generation' }));
      expect(mgr.getDefaultModel('text_generation')?.id).toBe('m1');
    });

    it('有 type、该类型仅有 inactive 模型：返回 undefined（getModelsByType 过滤后为空）', () => {
      mgr.registerModel(
        makeModel({ id: 'm1', type: 'text_generation', status: 'inactive' })
      );
      expect(mgr.getDefaultModel('text_generation')).toBeUndefined();
    });

    it('有 type、无该类型模型：返回 undefined', () => {
      mgr.registerModel(makeModel({ id: 'm1', type: 'text_embedding' }));
      expect(mgr.getDefaultModel('text_generation')).toBeUndefined();
    });
  });

  // ─── updateModel ─────────────────────────────────────────

  describe('updateModel', () => {
    it('未命中返回 false、不新增条目', () => {
      expect(mgr.updateModel('nope', { name: 'x' })).toBe(false);
      expect(mgr.getAllModels()).toHaveLength(0);
    });

    it('命中返回 true、浅合并 updates、刷新 updatedAt、保留未传字段', () => {
      const fixedCreated = new Date('2026-01-01T00:00:00Z');
      mgr.registerModel(
        makeModel({ id: 'm1', name: 'old', createdAt: fixedCreated })
      );
      expect(mgr.updateModel('m1', { name: 'new', status: 'maintenance' })).toBe(
        true
      );
      const m = mgr.getModel('m1')!;
      expect(m.name).toBe('new');
      expect(m.status).toBe('maintenance');
      expect(m.createdAt).toBe(fixedCreated);
      expect(m.updatedAt).toBeInstanceOf(Date);
    });
  });

  // ─── deleteModel ─────────────────────────────────────────

  describe('deleteModel', () => {
    it('命中返回 true 并移除', () => {
      mgr.registerModel(makeModel({ id: 'm1' }));
      expect(mgr.deleteModel('m1')).toBe(true);
      expect(mgr.getModel('m1')).toBeUndefined();
    });

    it('未命中返回 false', () => {
      expect(mgr.deleteModel('nope')).toBe(false);
    });

    it('删除默认模型后 defaultModelId 不被清理（锁 models.get 命中失败回退 undefined 的行为）', () => {
      mgr.registerModel(makeModel({ id: 'm1', isDefault: true }));
      mgr.deleteModel('m1');
      // defaultModelId 仍为 'm1'（truthy），getDefaultModel 直接 models.get('m1') → undefined
      expect(mgr.getModel('m1')).toBeUndefined();
      expect(mgr.getDefaultModel()).toBeUndefined();
    });
  });

  // ─── setDefaultModel ──────────────────────────────────────

  describe('setDefaultModel', () => {
    it('未命中返回 false', () => {
      expect(mgr.setDefaultModel('nope')).toBe(false);
    });

    it('status=inactive 命中返回 false（不置默认）', () => {
      mgr.registerModel(makeModel({ id: 'm1', status: 'inactive' }));
      expect(mgr.setDefaultModel('m1')).toBe(false);
      expect(mgr.getModel('m1')?.isDefault).toBeFalsy();
    });

    it('active 命中：清空其他模型 isDefault、置目标为默认、更新 defaultModelId', () => {
      mgr.registerModel(makeModel({ id: 'm1', isDefault: true }));
      mgr.registerModel(makeModel({ id: 'm2', isDefault: true }));
      mgr.registerModel(makeModel({ id: 'm3' }));
      expect(mgr.setDefaultModel('m3')).toBe(true);
      expect(mgr.getModel('m1')?.isDefault).toBe(false);
      expect(mgr.getModel('m2')?.isDefault).toBe(false);
      expect(mgr.getModel('m3')?.isDefault).toBe(true);
      expect(mgr.getDefaultModel()?.id).toBe('m3');
    });

    it('对已是默认的 active 模型再次 setDefaultModel：仍成功且仅其自身为默认', () => {
      mgr.registerModel(makeModel({ id: 'm1', isDefault: true }));
      expect(mgr.setDefaultModel('m1')).toBe(true);
      expect(mgr.getModel('m1')?.isDefault).toBe(true);
      expect(mgr.getDefaultModel()?.id).toBe('m1');
    });
  });

  // ─── testModel（async + setTimeout） ─────────────────────

  describe('testModel', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('未命中返回 {success:false, error:"模型不存在"}（无 latency）', async () => {
      expect(await mgr.testModel('nope')).toEqual({
        success: false,
        error: '模型不存在',
      });
      const r = await mgr.testModel('nope');
      expect(r.latency).toBeUndefined();
    });

    it('命中：await setTimeout(100ms) 后返回 {success:true, latency:100}', async () => {
      mgr.registerModel(makeModel({ id: 'm1' }));
      const p = mgr.testModel('m1');
      // 推进 100ms 使内部 setTimeout(100) resolve
      await vi.advanceTimersByTimeAsync(100);
      const r = await p;
      expect(r.success).toBe(true);
      expect(r.latency).toBe(100);
      expect(r.error).toBeUndefined();
    });
  });

  // ─── recordUsage / getUsageStatistics ────────────────────

  describe('recordUsage / getUsageStatistics', () => {
    it('首次 record：total/quota 与 byModel/byFeature/byDay 三桶均初始化', () => {
      mgr.recordUsage('m1', 'chat', 100, 0.05);
      const s = mgr.getUsageStatistics();
      expect(s.totalRequests).toBe(1);
      expect(s.totalTokens).toBe(100);
      expect(s.totalCost).toBeCloseTo(0.05, 10);
      expect(s.quotaUsed).toBe(1);
      expect(s.quotaLimit).toBe(1000);
      expect(s.byModel['m1'].requests).toBe(1);
      expect(s.byModel['m1'].tokens).toBe(100);
      expect(s.byModel['m1'].cost).toBeCloseTo(0.05, 10);
      expect(s.byFeature['chat'].requests).toBe(1);
      expect(s.byFeature['chat'].tokens).toBe(100);
      expect(s.byFeature['chat'].cost).toBeCloseTo(0.05, 10);
      expect(s.byDay).toHaveLength(1);
    });

    it('同 model+feature+day 二次 record：三桶累加而非新增', () => {
      mgr.recordUsage('m1', 'chat', 100, 0.05);
      mgr.recordUsage('m1', 'chat', 50, 0.02);
      const s = mgr.getUsageStatistics();
      const today = new Date().toISOString().split('T')[0];
      expect(s.totalRequests).toBe(2);
      expect(s.totalTokens).toBe(150);
      expect(s.totalCost).toBeCloseTo(0.07, 10);
      expect(s.byModel['m1'].requests).toBe(2);
      expect(s.byModel['m1'].tokens).toBe(150);
      expect(s.byModel['m1'].cost).toBeCloseTo(0.07, 10);
      expect(s.byFeature['chat'].requests).toBe(2);
      expect(s.byFeature['chat'].tokens).toBe(150);
      expect(s.byFeature['chat'].cost).toBeCloseTo(0.07, 10);
      expect(s.byDay).toHaveLength(1);
      expect(s.byDay[0].date).toBe(today);
      expect(s.byDay[0].requests).toBe(2);
      expect(s.byDay[0].tokens).toBe(150);
      expect(s.byDay[0].cost).toBeCloseTo(0.07, 10);
    });

    it('不同 model/feature 分别独立分桶', () => {
      mgr.recordUsage('m1', 'chat', 100, 0.05);
      mgr.recordUsage('m2', 'translate', 200, 0.1);
      const s = mgr.getUsageStatistics();
      expect(s.byModel['m1'].requests).toBe(1);
      expect(s.byModel['m1'].tokens).toBe(100);
      expect(s.byModel['m2'].requests).toBe(1);
      expect(s.byModel['m2'].tokens).toBe(200);
      expect(s.byFeature['chat'].requests).toBe(1);
      expect(s.byFeature['translate'].requests).toBe(1);
      expect(s.totalRequests).toBe(2);
      expect(s.totalTokens).toBe(300);
    });

    it('getUsageStatistics 只读：连续调用不改变内部统计', () => {
      mgr.recordUsage('m1', 'chat', 100, 0.05);
      mgr.getUsageStatistics();
      mgr.getUsageStatistics();
      expect(mgr.getUsageStatistics().totalRequests).toBe(1);
    });
  });

  // ─── recordUsage byDay 跨日 ──────────────────────────────

  describe('recordUsage byDay 跨日', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('同日多次 record：byDay 仅一条且累加', () => {
      mgr.recordUsage('m1', 'chat', 10, 0);
      mgr.recordUsage('m1', 'chat', 20, 0);
      const s = mgr.getUsageStatistics();
      expect(s.byDay).toHaveLength(1);
      expect(s.byDay[0].date).toBe('2026-07-01');
      expect(s.byDay[0].requests).toBe(2);
      expect(s.byDay[0].tokens).toBe(30);
    });

    it('跨日 record：byDay 新增一条（同日累加/跨日新增分支）', () => {
      mgr.recordUsage('m1', 'chat', 10, 0);
      vi.setSystemTime(new Date('2026-07-02T10:00:00Z'));
      mgr.recordUsage('m1', 'chat', 20, 0);
      const s = mgr.getUsageStatistics();
      expect(s.byDay).toHaveLength(2);
      expect(s.byDay[0].date).toBe('2026-07-01');
      expect(s.byDay[0].requests).toBe(1);
      expect(s.byDay[0].tokens).toBe(10);
      expect(s.byDay[1].date).toBe('2026-07-02');
      expect(s.byDay[1].requests).toBe(1);
      expect(s.byDay[1].tokens).toBe(20);
    });
  });

  // ─── checkQuota ──────────────────────────────────────────

  describe('checkQuota', () => {
    it('初始：available=true、used=0、limit=1000、remaining=1000', () => {
      expect(mgr.checkQuota()).toEqual({
        available: true,
        used: 0,
        limit: 1000,
        remaining: 1000,
      });
    });

    it('record N 次后：used=N、remaining=1000-N', () => {
      for (let i = 0; i < 5; i++) mgr.recordUsage('m1', 'chat', 1, 0);
      expect(mgr.checkQuota()).toEqual({
        available: true,
        used: 5,
        limit: 1000,
        remaining: 995,
      });
    });

    it('到达 limit：available=false（quotaUsed < quotaLimit 为 false）、remaining=0', () => {
      for (let i = 0; i < 1000; i++) mgr.recordUsage('m1', 'chat', 1, 0);
      const q = mgr.checkQuota();
      expect(q.available).toBe(false);
      expect(q.remaining).toBe(0);
      expect(q.used).toBe(1000);
    });

    it('remaining 永不为负（Math.max(0, ...)）：超额后仍为 0', () => {
      for (let i = 0; i < 1001; i++) mgr.recordUsage('m1', 'chat', 1, 0);
      const q = mgr.checkQuota();
      expect(q.remaining).toBe(0);
      expect(q.used).toBe(1001);
      expect(q.available).toBe(false);
    });
  });

  // ─── resetDailyQuota ─────────────────────────────────────

  describe('resetDailyQuota', () => {
    it('清零 quotaUsed 并设置 quotaResetAt、available 恢复 true', () => {
      mgr.recordUsage('m1', 'chat', 10, 0);
      mgr.recordUsage('m1', 'chat', 10, 0);
      expect(mgr.checkQuota().used).toBe(2);
      mgr.resetDailyQuota();
      expect(mgr.checkQuota().used).toBe(0);
      expect(mgr.checkQuota().available).toBe(true);
      expect(mgr.getUsageStatistics().quotaResetAt).toBeInstanceOf(Date);
    });

    it('reset 不影响 total*/byModel/byFeature/byDay', () => {
      mgr.recordUsage('m1', 'chat', 10, 0);
      mgr.resetDailyQuota();
      const s = mgr.getUsageStatistics();
      expect(s.totalRequests).toBe(1);
      expect(s.totalTokens).toBe(10);
      expect(s.byModel['m1'].requests).toBe(1);
      expect(s.byFeature['chat'].requests).toBe(1);
      expect(s.byDay).toHaveLength(1);
    });
  });

  // ─── generateText ────────────────────────────────────────

  describe('generateText', () => {
    it('无可用 text_generation 模型时抛 "没有可用的文本生成模型"', async () => {
      await expect(mgr.generateText('hello')).rejects.toThrow('没有可用的文本生成模型');
    });

    it('modelId 未命中时抛错（getModel 返回 undefined）', async () => {
      await expect(mgr.generateText('hello', { modelId: 'nope' })).rejects.toThrow();
    });

    it('默认模型：tokens=ceil(len/4)、cost=(tokens/1000)*costPer1kTokens', async () => {
      mgr.registerModel(
        makeModel({
          id: 'm1',
          type: 'text_generation',
          modelName: 'gpt-x',
          costPer1kTokens: 0.03,
        })
      );
      // "hello" 长度 5 → tokens=ceil(5/4)=2 → cost=(2/1000)*0.03=0.00006
      const r = await mgr.generateText('hello');
      expect(r.text).toBe('这是AI生成的文本内容...');
      expect(r.model).toBe('gpt-x');
      expect(r.tokens).toBe(2);
      expect(r.cost).toBeCloseTo(0.00006, 10);
    });

    it('costPer1kTokens 缺省（|| 0）→ cost=0', async () => {
      const m = makeModel({ id: 'm1', type: 'text_generation' });
      delete m.costPer1kTokens;
      mgr.registerModel(m);
      const r = await mgr.generateText('hello');
      expect(r.cost).toBe(0);
      expect(r.tokens).toBe(2);
    });

    it('modelId 优先于默认模型解析（即便目标类型非 text_generation）', async () => {
      mgr.registerModel(
        makeModel({ id: 'def', type: 'text_generation', modelName: 'def-name' })
      );
      mgr.registerModel(
        makeModel({
          id: 'spec',
          type: 'text_embedding',
          modelName: 'spec-name',
          costPer1kTokens: 0.01,
        })
      );
      const r = await mgr.generateText('hello', { modelId: 'spec' });
      expect(r.model).toBe('spec-name');
    });

    it('副作用：recordUsage 计入 byModel/byFeature("text_generation")/quotaUsed', async () => {
      mgr.registerModel(
        makeModel({ id: 'm1', type: 'text_generation', costPer1kTokens: 0.03 })
      );
      await mgr.generateText('hello');
      const s = mgr.getUsageStatistics();
      expect(s.byModel['m1'].requests).toBe(1);
      expect(s.byFeature['text_generation'].requests).toBe(1);
      expect(s.quotaUsed).toBe(1);
    });
  });

  // ─── generateEmbedding ───────────────────────────────────

  describe('generateEmbedding', () => {
    it('无可用 text_embedding 模型时抛 "没有可用的文本嵌入模型"', async () => {
      await expect(mgr.generateEmbedding('hello')).rejects.toThrow(
        '没有可用的文本嵌入模型'
      );
    });

    it('默认模型：embedding 长度 1536、tokens=ceil(len/4)、cost 数学正确', async () => {
      mgr.registerModel(
        makeModel({
          id: 'e1',
          type: 'text_embedding',
          modelName: 'ada-002',
          costPer1kTokens: 0.0001,
        })
      );
      const r = await mgr.generateEmbedding('hello');
      expect(r.model).toBe('ada-002');
      expect(r.embedding).toHaveLength(1536);
      expect(r.tokens).toBe(2);
      expect(r.cost).toBeCloseTo((2 / 1000) * 0.0001, 10);
    });

    it('modelId 优先解析', async () => {
      mgr.registerModel(
        makeModel({ id: 'e1', type: 'text_embedding', modelName: 'e1-name' })
      );
      mgr.registerModel(
        makeModel({ id: 'e2', type: 'text_embedding', modelName: 'e2-name' })
      );
      const r = await mgr.generateEmbedding('hi', { modelId: 'e2' });
      expect(r.model).toBe('e2-name');
    });

    it('副作用：recordUsage 计入 byFeature("embedding")', async () => {
      mgr.registerModel(
        makeModel({ id: 'e1', type: 'text_embedding', costPer1kTokens: 0.0001 })
      );
      await mgr.generateEmbedding('hello');
      expect(mgr.getUsageStatistics().byFeature['embedding'].requests).toBe(1);
    });
  });

  // ─── createChatSession ───────────────────────────────────

  describe('createChatSession', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('默认标题与默认 text_generation 模型解析、id=chat-${Date.now()}', () => {
      mgr.registerModel(makeModel({ id: 'm1', type: 'text_generation' }));
      const s = mgr.createChatSession('tenant-1', 'user-1');
      expect(s.id).toBe(`chat-${NOW_TS}`);
      expect(s.tenantId).toBe('tenant-1');
      expect(s.userId).toBe('user-1');
      expect(s.title).toBe('新对话');
      expect(s.modelId).toBe('m1');
      expect(s.messages).toEqual([]);
      expect(s.status).toBe('active');
      expect(s.totalTokens).toBe(0);
      expect(s.createdAt).toBeInstanceOf(Date);
      expect(s.updatedAt).toBeInstanceOf(Date);
    });

    it('自定义 title / modelId / systemPrompt 透传', () => {
      mgr.registerModel(makeModel({ id: 'm1', type: 'text_generation' }));
      mgr.registerModel(
        makeModel({ id: 'm2', type: 'text_generation', modelName: 'm2-name' })
      );
      const s = mgr.createChatSession('t', 'u', {
        title: '自定义标题',
        modelId: 'm2',
        systemPrompt: '你是助手',
      });
      expect(s.title).toBe('自定义标题');
      expect(s.modelId).toBe('m2');
      expect(s.systemPrompt).toBe('你是助手');
    });

    it('无可用 text_generation 模型：modelId 为空字符串', () => {
      const s = mgr.createChatSession('t', 'u');
      expect(s.modelId).toBe('');
    });
  });

  // ─── sendChatMessage ─────────────────────────────────────

  describe('sendChatMessage', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('session.modelId 未命中抛 "模型不存在"', async () => {
      const session = mgr.createChatSession('t', 'u'); // modelId=''
      await expect(mgr.sendChatMessage(session, 'hi')).rejects.toThrow('模型不存在');
    });

    it('命中：返回 assistant 消息，id=msg-${Date.now()}、tokens=ceil(len/4)', async () => {
      mgr.registerModel(
        makeModel({
          id: 'm1',
          type: 'text_generation',
          modelName: 'gpt-x',
          costPer1kTokens: 0.03,
        })
      );
      const session = mgr.createChatSession('t', 'u', { modelId: 'm1' });
      // "hello" 长度 5 → tokens=ceil(5/4)=2
      const msg = await mgr.sendChatMessage(session, 'hello');
      expect(msg.id).toBe(`msg-${NOW_TS}`);
      expect(msg.role).toBe('assistant');
      expect(msg.content).toBe('这是AI的回复内容...');
      expect(msg.model).toBe('gpt-x');
      expect(msg.tokens).toBe(2);
      expect(msg.timestamp).toBeInstanceOf(Date);
    });

    it('副作用：recordUsage 计入 byFeature("chat")/byModel', async () => {
      mgr.registerModel(
        makeModel({ id: 'm1', type: 'text_generation', costPer1kTokens: 0.03 })
      );
      const session = mgr.createChatSession('t', 'u', { modelId: 'm1' });
      await mgr.sendChatMessage(session, 'hello');
      const s = mgr.getUsageStatistics();
      expect(s.byFeature['chat'].requests).toBe(1);
      expect(s.byModel['m1'].requests).toBe(1);
    });
  });

  // ─── getSupportedFeatures / isFeatureAvailable ────────────

  describe('getSupportedFeatures / isFeatureAvailable', () => {
    it('空注册表：getSupportedFeatures 返回 []、isFeatureAvailable 恒 false', () => {
      expect(mgr.getSupportedFeatures()).toEqual([]);
      expect(mgr.isFeatureAvailable('文本生成')).toBe(false);
    });

    it('单 active 模型：返回其 capabilities', () => {
      mgr.registerModel(makeModel({ id: 'm1', capabilities: ['文本生成', '对话'] }));
      expect(mgr.getSupportedFeatures().sort()).toEqual(['对话', '文本生成']);
    });

    it('多 active 模型：capabilities 取并集且去重（Set）', () => {
      mgr.registerModel(makeModel({ id: 'm1', capabilities: ['文本生成', '对话'] }));
      mgr.registerModel(makeModel({ id: 'm2', capabilities: ['对话', '翻译'] }));
      expect(mgr.getSupportedFeatures().sort()).toEqual(['对话', '文本生成', '翻译']);
    });

    it('inactive 模型的 capabilities 不计入并集', () => {
      mgr.registerModel(makeModel({ id: 'm1', capabilities: ['文本生成'] }));
      mgr.registerModel(
        makeModel({ id: 'm2', status: 'inactive', capabilities: ['图像分析'] })
      );
      expect(mgr.getSupportedFeatures()).toEqual(['文本生成']);
      expect(mgr.isFeatureAvailable('图像分析')).toBe(false);
      expect(mgr.isFeatureAvailable('文本生成')).toBe(true);
    });
  });
});
