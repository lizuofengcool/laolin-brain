import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * ai/face-detection 单测
 *
 * 模块结构：
 * - `detectFaces(imageBase64)`：经 z-ai-web-dev-sdk 调用视觉模型，60s 超时，
 *   解析返回 JSON 数组为人脸列表（id/x/y/width/height/description/embedding），
 *   按 width>0 && height>0 过滤；AbortError 视为超时返回 []，其余异常返回 []。
 * - 私有 `getZAI`：懒加载单例（ZAI.create 缓存于模块级 zaiInstance）。
 * - 私有 `createTimeoutController`：构造 AbortController + setTimeout(60s)，返回 cleanup。
 *
 * mock 策略（同 ai-vision.test.ts）：vi.hoisted + vi.mock('z-ai-web-dev-sdk')
 * 暴露 mockCreate，每例 beforeEach vi.resetModules() 重置模块级单例 zaiInstance=null。
 * crypto.randomUUID 不 mock（沿用 invitations-route.test.ts 范式避免内置模块 mock 风险），
 * 用 UUID 正则断言 id 形状 + 多人脸时断言两 id 互异。
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
}));

vi.mock('z-ai-web-dev-sdk', () => ({
  default: { create: mockCreate },
  __esModule: true,
}));

/** 构造一个 zai 实例桩，chat.completions.create 由 mockCompletionCreate 提供。 */
function makeZai(mockCompletionCreate: ReturnType<typeof vi.fn>) {
  return {
    chat: {
      completions: {
        create: mockCompletionCreate,
      },
    },
  };
}

/** 单人脸原始对象工厂。 */
function makeFace(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    x: 10,
    y: 20,
    width: 30,
    height: 40,
    description: '男性,25-35岁,短发',
    embedding: [0.1, 0.2, 0.3],
    ...overrides,
  };
}

describe('detectFaces', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  // ─── 成功路径 ────────────────────────────────────────────────

  it('单人脸全部字段有效时返回映射结果（id 为 UUID/取整/描述/embedding 透传）', async () => {
    const mockCompletionCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify([makeFace()]) } }],
    });
    mockCreate.mockResolvedValue(makeZai(mockCompletionCreate));

    const { detectFaces } = await import('@/lib/ai/face-detection');
    const result = await detectFaces('img-base64');

    expect(result).toEqual([
      {
        id: expect.stringMatching(UUID_RE),
        x: 10,
        y: 20,
        width: 30,
        height: 40,
        description: '男性,25-35岁,短发',
        embedding: [0.1, 0.2, 0.3],
      },
    ]);
  });

  it('多人脸全部返回并各自分配互异的 UUID id', async () => {
    const mockCompletionCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify([makeFace(), makeFace({ width: 50 })]) } }],
    });
    mockCreate.mockResolvedValue(makeZai(mockCompletionCreate));

    const { detectFaces } = await import('@/lib/ai/face-detection');
    const result = await detectFaces('img');

    expect(result).toHaveLength(2);
    expect(result[0].id).toMatch(UUID_RE);
    expect(result[1].id).toMatch(UUID_RE);
    expect(result[0].id).not.toBe(result[1].id);
    expect(result[1].width).toBe(50);
  });

  it('浮点坐标经 Math.round 取整', async () => {
    const mockCompletionCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify([makeFace({ x: 10.6, y: 20.4, width: 33.5, height: 41.5 })]) } }],
    });
    mockCreate.mockResolvedValue(makeZai(mockCompletionCreate));

    const { detectFaces } = await import('@/lib/ai/face-detection');
    const result = await detectFaces('img');

    expect(result[0]).toMatchObject({ x: 11, y: 20, width: 34, height: 42 });
  });

  // ─── JSON 提取 / 解析 ───────────────────────────────────────

  it('markdown 包裹的 JSON（```json ... ```）能被正则提取', async () => {
    const content = '```json\n' + JSON.stringify([makeFace()]) + '\n```';
    const mockCompletionCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content } }],
    });
    mockCreate.mockResolvedValue(makeZai(mockCompletionCreate));

    const { detectFaces } = await import('@/lib/ai/face-detection');
    const result = await detectFaces('img');

    expect(result).toHaveLength(1);
  });

  it('JSON 前后有说明文字时正则仍提取 [..] 片段', async () => {
    const content = '检测到以下人脸：\n' + JSON.stringify([makeFace(), makeFace({ width: 25 })]) + '\n以上结果仅供参考。';
    const mockCompletionCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content } }],
    });
    mockCreate.mockResolvedValue(makeZai(mockCompletionCreate));

    const { detectFaces } = await import('@/lib/ai/face-detection');
    const result = await detectFaces('img');

    expect(result).toHaveLength(2);
  });

  it('返回空数组 [] 时映射为空结果', async () => {
    const mockCompletionCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: '[]' } }],
    });
    mockCreate.mockResolvedValue(makeZai(mockCompletionCreate));

    const { detectFaces } = await import('@/lib/ai/face-detection');
    const result = await detectFaces('img');

    expect(result).toEqual([]);
  });

  it('content 缺失时回退为 [] 并返回空数组', async () => {
    const mockCompletionCreate = vi.fn().mockResolvedValue({
      choices: [{ message: {} }],
    });
    mockCreate.mockResolvedValue(makeZai(mockCompletionCreate));

    const { detectFaces } = await import('@/lib/ai/face-detection');
    const result = await detectFaces('img');

    expect(result).toEqual([]);
  });

  it('choices 数组为空时 content 回退为 []', async () => {
    const mockCompletionCreate = vi.fn().mockResolvedValue({ choices: [] });
    mockCreate.mockResolvedValue(makeZai(mockCompletionCreate));

    const { detectFaces } = await import('@/lib/ai/face-detection');
    const result = await detectFaces('img');

    expect(result).toEqual([]);
  });

  it('JSON 解析为对象（非数组）时返回空数组', async () => {
    const mockCompletionCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: '{"x":1}' } }],
    });
    mockCreate.mockResolvedValue(makeZai(mockCompletionCreate));

    const { detectFaces } = await import('@/lib/ai/face-detection');
    const result = await detectFaces('img');

    expect(result).toEqual([]);
  });

  it('JSON 解析为数字（非数组）时返回空数组', async () => {
    const mockCompletionCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: '42' } }],
    });
    mockCreate.mockResolvedValue(makeZai(mockCompletionCreate));

    const { detectFaces } = await import('@/lib/ai/face-detection');
    const result = await detectFaces('img');

    expect(result).toEqual([]);
  });

  it('content 为不含数组的纯文本时 JSON.parse 抛错，捕获后返回 []', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const mockCompletionCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: '未检测到人脸' } }],
    });
    mockCreate.mockResolvedValue(makeZai(mockCompletionCreate));

    const { detectFaces } = await import('@/lib/ai/face-detection');
    const result = await detectFaces('img');

    expect(result).toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith('Face detection failed:', expect.any(Error));
  });

  // ─── 字段映射 / 容错 ────────────────────────────────────────

  it('x/y/width/height 非数字时回退为 0', async () => {
    const mockCompletionCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify([makeFace({ x: 'a', y: null, width: true, height: undefined })]) } }],
    });
    mockCreate.mockResolvedValue(makeZai(mockCompletionCreate));

    const { detectFaces } = await import('@/lib/ai/face-detection');
    const result = await detectFaces('img');

    // width=0 命中过滤，整张人脸被剔除
    expect(result).toEqual([]);
  });

  it('description 非字符串时回退为空串', async () => {
    const mockCompletionCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify([makeFace({ description: 123 })]) } }],
    });
    mockCreate.mockResolvedValue(makeZai(mockCompletionCreate));

    const { detectFaces } = await import('@/lib/ai/face-detection');
    const result = await detectFaces('img');

    expect(result[0].description).toBe('');
  });

  it('embedding 非数组时回退为空数组', async () => {
    const mockCompletionCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify([makeFace({ embedding: 'nope' })]) } }],
    });
    mockCreate.mockResolvedValue(makeZai(mockCompletionCreate));

    const { detectFaces } = await import('@/lib/ai/face-detection');
    const result = await detectFaces('img');

    expect(result[0].embedding).toEqual([]);
  });

  it('embedding 含非数字元素时被过滤', async () => {
    const mockCompletionCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify([makeFace({ embedding: [0.1, 'x', null, 0.4, true] })]) } }],
    });
    mockCreate.mockResolvedValue(makeZai(mockCompletionCreate));

    const { detectFaces } = await import('@/lib/ai/face-detection');
    const result = await detectFaces('img');

    // 仅 number 类型保留：0.1、0.4
    expect(result[0].embedding).toEqual([0.1, 0.4]);
  });

  it('embedding 超过 32 个数字时截断为前 32 个', async () => {
    const big = Array.from({ length: 40 }, (_, i) => i / 40);
    const mockCompletionCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify([makeFace({ embedding: big })]) } }],
    });
    mockCreate.mockResolvedValue(makeZai(mockCompletionCreate));

    const { detectFaces } = await import('@/lib/ai/face-detection');
    const result = await detectFaces('img');

    expect(result[0].embedding).toHaveLength(32);
    expect(result[0].embedding).toEqual(big.slice(0, 32));
  });

  // ─── 过滤逻辑 ───────────────────────────────────────────────

  it('width=0 的人脸被过滤', async () => {
    const mockCompletionCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify([makeFace({ width: 0 })]) } }],
    });
    mockCreate.mockResolvedValue(makeZai(mockCompletionCreate));

    const { detectFaces } = await import('@/lib/ai/face-detection');
    const result = await detectFaces('img');

    expect(result).toEqual([]);
  });

  it('height=0 的人脸被过滤', async () => {
    const mockCompletionCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify([makeFace({ height: 0 })]) } }],
    });
    mockCreate.mockResolvedValue(makeZai(mockCompletionCreate));

    const { detectFaces } = await import('@/lib/ai/face-detection');
    const result = await detectFaces('img');

    expect(result).toEqual([]);
  });

  it('width 为负数的人脸被过滤（width>0 守卫）', async () => {
    const mockCompletionCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify([makeFace({ width: -5 })]) } }],
    });
    mockCreate.mockResolvedValue(makeZai(mockCompletionCreate));

    const { detectFaces } = await import('@/lib/ai/face-detection');
    const result = await detectFaces('img');

    expect(result).toEqual([]);
  });

  it('有效与无效人脸混合时仅保留有效项', async () => {
    const faces = [
      makeFace({ description: 'A' }),
      makeFace({ width: 0, description: 'B' }),
      makeFace({ height: 0, description: 'C' }),
      makeFace({ description: 'D' }),
    ];
    const mockCompletionCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(faces) } }],
    });
    mockCreate.mockResolvedValue(makeZai(mockCompletionCreate));

    const { detectFaces } = await import('@/lib/ai/face-detection');
    const result = await detectFaces('img');

    expect(result).toHaveLength(2);
    expect(result.map((f) => f.description)).toEqual(['A', 'D']);
  });

  // ─── 异常分支 ───────────────────────────────────────────────

  it('AbortError（DOMException）视为超时，返回 [] 并打印超时日志', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const abortError = new DOMException('The user aborted a request', 'AbortError');
    const mockCompletionCreate = vi.fn().mockRejectedValue(abortError);
    mockCreate.mockResolvedValue(makeZai(mockCompletionCreate));

    const { detectFaces } = await import('@/lib/ai/face-detection');
    const result = await detectFaces('img');

    expect(result).toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith('Face detection timed out after 60 seconds');
  });

  it('AbortError（普通对象 name=AbortError）同样走超时分支', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const abortLike = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const mockCompletionCreate = vi.fn().mockRejectedValue(abortLike);
    mockCreate.mockResolvedValue(makeZai(mockCompletionCreate));

    const { detectFaces } = await import('@/lib/ai/face-detection');
    const result = await detectFaces('img');

    expect(result).toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith('Face detection timed out after 60 seconds');
  });

  it('通用错误返回 [] 并打印失败日志', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const mockCompletionCreate = vi.fn().mockRejectedValue(new Error('model down'));
    mockCreate.mockResolvedValue(makeZai(mockCompletionCreate));

    const { detectFaces } = await import('@/lib/ai/face-detection');
    const result = await detectFaces('img');

    expect(result).toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith('Face detection failed:', expect.any(Error));
  });

  it('ZAI.create() 抛错时返回 [] 并打印失败日志（非超时）', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockCreate.mockRejectedValue(new Error('sdk init failed'));

    const { detectFaces } = await import('@/lib/ai/face-detection');
    const result = await detectFaces('img');

    expect(result).toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith('Face detection failed:', expect.any(Error));
    expect(errorSpy).not.toHaveBeenCalledWith('Face detection timed out after 60 seconds');
  });

  // ─── 调用形状 / 单例 / 超时 ─────────────────────────────────

  it('请求携带 system + user 两条消息，user 消息含 base64 图片', async () => {
    const mockCompletionCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: '[]' } }],
    });
    mockCreate.mockResolvedValue(makeZai(mockCompletionCreate));

    const { detectFaces } = await import('@/lib/ai/face-detection');
    await detectFaces('my-base64-data');

    expect(mockCompletionCreate).toHaveBeenCalledTimes(1);
    const args = mockCompletionCreate.mock.calls[0][0];
    expect(args.messages).toHaveLength(2);
    expect(args.messages[0].role).toBe('system');
    expect(args.messages[1].role).toBe('user');
    const userContent = JSON.stringify(args.messages[1].content);
    expect(userContent).toContain('my-base64-data');
    expect(userContent).toContain('data:image/jpeg;base64,my-base64-data');
  });

  it('请求传入 AbortSignal（signal 字段为实例）', async () => {
    const mockCompletionCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: '[]' } }],
    });
    mockCreate.mockResolvedValue(makeZai(mockCompletionCreate));

    const { detectFaces } = await import('@/lib/ai/face-detection');
    await detectFaces('img');

    const args = mockCompletionCreate.mock.calls[0][0];
    expect(args.signal).toBeInstanceOf(AbortSignal);
  });

  it('同一模块加载内连续两次调用仅触发一次 ZAI.create（单例缓存）', async () => {
    const mockCompletionCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: '[]' } }],
    });
    mockCreate.mockResolvedValue(makeZai(mockCompletionCreate));

    const { detectFaces } = await import('@/lib/ai/face-detection');
    await detectFaces('img1');
    await detectFaces('img2');

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCompletionCreate).toHaveBeenCalledTimes(2);
  });

  it('超时控制器默认 60s：未到 60s 不超时，到达 60s 触发 abort 走超时分支', async () => {
    vi.useFakeTimers();
    try {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      // create 返回随 signal abort 而 reject 的 pending promise，模拟长耗时模型调用
      const mockCompletionCreate = vi.fn().mockImplementation((args: { signal: AbortSignal }) => {
        return new Promise((_resolve, reject) => {
          args.signal.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        });
      });
      mockCreate.mockResolvedValue(makeZai(mockCompletionCreate));

      const { detectFaces } = await import('@/lib/ai/face-detection');
      const promise = detectFaces('img');

      // 未到 60s：定时器未触发，promise 仍 pending，不应打印超时日志
      await vi.advanceTimersByTimeAsync(59_999);
      expect(errorSpy).not.toHaveBeenCalledWith('Face detection timed out after 60 seconds');

      // 到达 60s：setTimeout 回调触发 controller.abort() → create promise reject AbortError
      await vi.advanceTimersByTimeAsync(1);

      const result = await promise;
      expect(result).toEqual([]);
      expect(errorSpy).toHaveBeenCalledWith('Face detection timed out after 60 seconds');
      expect(mockCompletionCreate).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('JSON.parse 抛错时 finally 仍清理定时器（不抛泄漏）', async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const mockCompletionCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: '纯文本无数组' } }],
    });
    mockCreate.mockResolvedValue(makeZai(mockCompletionCreate));

    const { detectFaces } = await import('@/lib/ai/face-detection');
    await detectFaces('img');

    // finally 必然调用 cleanup -> clearTimeout
    expect(clearTimeoutSpy).toHaveBeenCalled();
  });
});
