/**
 * 工作流引擎（基础版）单测
 *
 * 覆盖目标：src/lib/workflow/workflow-engine.ts。该模块为纯内存态引擎（仅从
 * ./types 导入类型，types.ts 无任何 import，零运行时外部依赖、无 db/SDK/server
 * 依赖），负责工作流定义校验、实例创建、节点调度、条件分支与动作处理器分发。
 * 此前零覆盖（无任何测试文件真实导入本模块）。
 *
 * 本测试通过构造 WorkflowDefinition + 执行 startWorkflow，覆盖：
 * - 模块导出：WorkflowEngine 类 / workflowEngine 单例
 * - 默认动作处理器：7 个内置 actionType 注册集合 + getSupportedActionTypes
 * - registerActionHandler：新增/覆盖/独立实例隔离/自定义处理器被调用
 * - validateWorkflow：开始/结束节点、节点 ID 唯一性、边有效性、多错误累积
 * - startWorkflow 生命周期：实例字段拷贝、变量合并/默认值、completed/failed
 * - 节点类型分发：start/end/condition/action/wait/parallel/subflow/未知类型
 * - 动作处理器：7 个内置 handler 输出 + 缺失/未知 actionType 错误
 * - 条件分支：getNextNodeId 真分支/假分支回退/无条件边/无出边终止
 * - evaluateCondition：{{var}} 替换 + ==/!=/>/< 比较 + parseValue 数值/字符串
 *
 * 纯内存执行，仅 delay 用 duration:0 避免慢测；无 mock。
 */
import { describe, it, expect } from "vitest";
import { WorkflowEngine, workflowEngine } from "@/lib/workflow/workflow-engine";
import type {
  WorkflowDefinition,
  WorkflowNode,
  WorkflowEdge,
  ActionHandler,
} from "@/lib/workflow/types";

/** 构造工作流定义（提供合理默认值，允许部分覆盖） */
function makeDefinition(
  overrides: Partial<WorkflowDefinition> & { nodes: WorkflowNode[]; edges: WorkflowEdge[] }
): WorkflowDefinition {
  return {
    id: "wf-1",
    tenantId: "tenant-1",
    userId: "user-1",
    name: "测试工作流",
    description: "测试用",
    nodes: overrides.nodes,
    edges: overrides.edges,
    variables: overrides.variables ?? [],
    version: 1,
    status: "published",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

/** 构造节点 */
function makeNode(
  id: string,
  type: WorkflowNode["type"],
  config?: Record<string, any>
): WorkflowNode {
  return { id, type, name: id, config };
}

/** 构造边 */
function makeEdge(source: string, target: string, condition?: string): WorkflowEdge {
  return { id: `e-${source}-${target}`, source, target, condition };
}

/** 最小可执行工作流：start → end */
function minimalDefinition(): WorkflowDefinition {
  return makeDefinition({
    nodes: [makeNode("start", "start"), makeNode("end", "end")],
    edges: [makeEdge("start", "end")],
  });
}

/** 记录被调用情况的动作处理器工厂 */
function recordingHandler(marker: string, sink: Record<string, any>): ActionHandler {
  return async (context, config) => {
    sink.marker = marker;
    sink.config = config;
    sink.instanceId = context.instance.id;
    sink.variables = { ...context.variables };
    return { marker };
  };
}

// ============================================================================
// 模块导出
// ============================================================================

describe("workflow-engine 模块导出", () => {
  it("WorkflowEngine 是可实例化的类", () => {
    expect(typeof WorkflowEngine).toBe("function");
    const engine = new WorkflowEngine();
    expect(engine).toBeInstanceOf(WorkflowEngine);
  });

  it("workflowEngine 是 WorkflowEngine 的单例实例", () => {
    expect(workflowEngine).toBeInstanceOf(WorkflowEngine);
  });

  it("两个 WorkflowEngine 实例的处理器集合相互独立", () => {
    const a = new WorkflowEngine();
    const b = new WorkflowEngine();
    a.registerActionHandler("only-in-a", async () => ({ ok: true }));
    expect(a.getSupportedActionTypes()).toContain("only-in-a");
    expect(b.getSupportedActionTypes()).not.toContain("only-in-a");
  });
});

// ============================================================================
// 默认动作处理器 / getSupportedActionTypes
// ============================================================================

describe("getSupportedActionTypes 默认处理器", () => {
  it("返回数组", () => {
    expect(Array.isArray(workflowEngine.getSupportedActionTypes())).toBe(true);
  });

  it("默认注册 7 个内置 actionType", () => {
    expect(workflowEngine.getSupportedActionTypes()).toHaveLength(7);
  });

  it("默认 actionType 集合与期望一致", () => {
    expect(new Set(workflowEngine.getSupportedActionTypes())).toEqual(
      new Set([
        "send_notification",
        "call_webhook",
        "delay",
        "ai_summarize",
        "ai_generate_tags",
        "move_file",
        "http_request",
      ])
    );
  });

  it("types 中 BUILTIN_ACTIONS 的 create_file 未被引擎注册（仅声明未实现）", () => {
    // BUILTIN_ACTIONS 列出 8 个含 create_file，但引擎只注册 7 个 handler
    expect(workflowEngine.getSupportedActionTypes()).not.toContain("create_file");
  });
});

// ============================================================================
// registerActionHandler
// ============================================================================

describe("registerActionHandler", () => {
  it("注册新 actionType 后出现在 getSupportedActionTypes", () => {
    const engine = new WorkflowEngine();
    const before = engine.getSupportedActionTypes().length;
    engine.registerActionHandler("custom-x", async () => ({ ok: true }));
    expect(engine.getSupportedActionTypes()).toContain("custom-x");
    expect(engine.getSupportedActionTypes()).toHaveLength(before + 1);
  });

  it("覆盖已存在的 actionType 不增加数量", () => {
    const engine = new WorkflowEngine();
    const before = engine.getSupportedActionTypes().length;
    engine.registerActionHandler("send_notification", async () => ({ overridden: true }));
    expect(engine.getSupportedActionTypes()).toHaveLength(before);
    expect(engine.getSupportedActionTypes()).toContain("send_notification");
  });

  it("自定义处理器在执行时被调用并接收 context + config", async () => {
    const engine = new WorkflowEngine();
    const sink: Record<string, any> = {};
    engine.registerActionHandler("probe", recordingHandler("PROBED", sink));

    const def = makeDefinition({
      nodes: [
        makeNode("start", "start"),
        makeNode("act", "action", { actionType: "probe", extra: "data" }),
        makeNode("end", "end"),
      ],
      edges: [makeEdge("start", "act"), makeEdge("act", "end")],
    });

    const instance = await engine.startWorkflow(def, { initVar: 1 }, "user-9");
    expect(sink.marker).toBe("PROBED");
    expect(sink.config).toEqual({ actionType: "probe", extra: "data" });
    expect(sink.instanceId).toBe(instance.id);
    expect(sink.variables.initVar).toBe(1);
    expect(instance.status).toBe("completed");
    expect(instance.variables.marker).toBe("PROBED");
  });
});

// ============================================================================
// validateWorkflow
// ============================================================================

describe("validateWorkflow", () => {
  it("合法工作流返回 valid:true 与空错误数组", () => {
    const engine = new WorkflowEngine();
    const result = engine.validateWorkflow(minimalDefinition());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("缺少开始节点报错", () => {
    const engine = new WorkflowEngine();
    const def = makeDefinition({
      nodes: [makeNode("end", "end")],
      edges: [],
    });
    const result = engine.validateWorkflow(def);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("工作流缺少开始节点");
  });

  it("多个开始节点报错", () => {
    const engine = new WorkflowEngine();
    const def = makeDefinition({
      nodes: [makeNode("s1", "start"), makeNode("s2", "start"), makeNode("end", "end")],
      edges: [makeEdge("s1", "end")],
    });
    const result = engine.validateWorkflow(def);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("工作流有多个开始节点");
  });

  it("缺少结束节点报错", () => {
    const engine = new WorkflowEngine();
    const def = makeDefinition({
      nodes: [makeNode("start", "start")],
      edges: [],
    });
    const result = engine.validateWorkflow(def);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("工作流缺少结束节点");
  });

  it("重复节点 ID 报错", () => {
    const engine = new WorkflowEngine();
    const def = makeDefinition({
      nodes: [makeNode("start", "start"), makeNode("start", "end"), makeNode("end", "end")],
      edges: [makeEdge("start", "end")],
    });
    const result = engine.validateWorkflow(def);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("重复的节点ID: start");
  });

  it("边的源节点不存在报错", () => {
    const engine = new WorkflowEngine();
    const def = makeDefinition({
      nodes: [makeNode("start", "start"), makeNode("end", "end")],
      edges: [makeEdge("ghost", "end")],
    });
    const result = engine.validateWorkflow(def);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("边的源节点不存在: ghost");
  });

  it("边的目标节点不存在报错", () => {
    const engine = new WorkflowEngine();
    const def = makeDefinition({
      nodes: [makeNode("start", "start"), makeNode("end", "end")],
      edges: [makeEdge("start", "nowhere")],
    });
    const result = engine.validateWorkflow(def);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("边的目标节点不存在: nowhere");
  });

  it("多种问题同时存在时错误累积", () => {
    const engine = new WorkflowEngine();
    // 同时缺开始 + 缺结束 + 边无效
    const def = makeDefinition({
      nodes: [makeNode("only", "action", { actionType: "delay" })],
      edges: [makeEdge("only", "missing")],
    });
    const result = engine.validateWorkflow(def);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
    expect(result.errors).toContain("工作流缺少开始节点");
    expect(result.errors).toContain("工作流缺少结束节点");
    expect(result.errors).toContain("边的目标节点不存在: missing");
  });
});

// ============================================================================
// startWorkflow 生命周期与实例字段
// ============================================================================

describe("startWorkflow 实例字段与生命周期", () => {
  it("实例 id 以 wf-instance- 前缀", async () => {
    const engine = new WorkflowEngine();
    const instance = await engine.startWorkflow(minimalDefinition(), {}, "u1");
    expect(instance.id.startsWith("wf-instance-")).toBe(true);
  });

  it("实例拷贝定义的 tenantId/workflowId/workflowVersion", async () => {
    const engine = new WorkflowEngine();
    const def = makeDefinition({
      id: "wf-xyz",
      tenantId: "tenant-99",
      version: 7,
      nodes: [makeNode("start", "start"), makeNode("end", "end")],
      edges: [makeEdge("start", "end")],
    });
    const instance = await engine.startWorkflow(def, {}, "u1");
    expect(instance.tenantId).toBe("tenant-99");
    expect(instance.workflowId).toBe("wf-xyz");
    expect(instance.workflowVersion).toBe(7);
  });

  it("实例拷贝 startedBy 参数", async () => {
    const engine = new WorkflowEngine();
    const instance = await engine.startWorkflow(minimalDefinition(), {}, "starter-abc");
    expect(instance.startedBy).toBe("starter-abc");
  });

  it("startedAt 为 Date，完成时 completedAt 被设置", async () => {
    const engine = new WorkflowEngine();
    const instance = await engine.startWorkflow(minimalDefinition(), {}, "u1");
    expect(instance.startedAt).toBeInstanceOf(Date);
    expect(instance.completedAt).toBeInstanceOf(Date);
    expect(instance.completedAt!.getTime()).toBeGreaterThanOrEqual(instance.startedAt.getTime());
  });

  it("正常完成时 status 为 completed", async () => {
    const engine = new WorkflowEngine();
    const instance = await engine.startWorkflow(minimalDefinition(), {}, "u1");
    expect(instance.status).toBe("completed");
  });

  it("initialVariables 被合并进实例变量", async () => {
    const engine = new WorkflowEngine();
    const instance = await engine.startWorkflow(minimalDefinition(), { a: 1, b: "x" }, "u1");
    expect(instance.variables.a).toBe(1);
    expect(instance.variables.b).toBe("x");
  });

  it("定义变量的 defaultValue 在 initialVariables 未提供时生效", async () => {
    const engine = new WorkflowEngine();
    const def = makeDefinition({
      nodes: [makeNode("start", "start"), makeNode("end", "end")],
      edges: [makeEdge("start", "end")],
      variables: [
        { name: "threshold", type: "number", defaultValue: 100 },
        { name: "name", type: "string", defaultValue: "default" },
      ],
    });
    const instance = await engine.startWorkflow(def, {}, "u1");
    expect(instance.variables.threshold).toBe(100);
    expect(instance.variables.name).toBe("default");
  });

  it("initialVariables 优先于 defaultValue", async () => {
    const engine = new WorkflowEngine();
    const def = makeDefinition({
      nodes: [makeNode("start", "start"), makeNode("end", "end")],
      edges: [makeEdge("start", "end")],
      variables: [{ name: "threshold", type: "number", defaultValue: 100 }],
    });
    const instance = await engine.startWorkflow(def, { threshold: 42 }, "u1");
    expect(instance.variables.threshold).toBe(42);
  });

  it("defaultValue 为 undefined 的变量不被写入", async () => {
    const engine = new WorkflowEngine();
    const def = makeDefinition({
      nodes: [makeNode("start", "start"), makeNode("end", "end")],
      edges: [makeEdge("start", "end")],
      variables: [{ name: "noDefault", type: "string" }],
    });
    const instance = await engine.startWorkflow(def, {}, "u1");
    expect("noDefault" in instance.variables).toBe(false);
  });

  it("动作节点输出被合并进实例变量", async () => {
    const engine = new WorkflowEngine();
    engine.registerActionHandler("emit", async () => ({ produced: 7 }));
    const def = makeDefinition({
      nodes: [
        makeNode("start", "start"),
        makeNode("act", "action", { actionType: "emit" }),
        makeNode("end", "end"),
      ],
      edges: [makeEdge("start", "act"), makeEdge("act", "end")],
    });
    const instance = await engine.startWorkflow(def, {}, "u1");
    expect(instance.variables.produced).toBe(7);
  });
});

// ============================================================================
// startWorkflow 错误路径
// ============================================================================

describe("startWorkflow 错误路径", () => {
  it("没有开始节点 → status failed 且 errorMessage 记录原因", async () => {
    const engine = new WorkflowEngine();
    const def = makeDefinition({
      nodes: [makeNode("end", "end")],
      edges: [],
    });
    const instance = await engine.startWorkflow(def, {}, "u1");
    expect(instance.status).toBe("failed");
    expect(instance.errorMessage).toBe("工作流没有开始节点");
    expect(instance.completedAt).toBeInstanceOf(Date);
  });

  it("动作节点缺少 actionType → failed", async () => {
    const engine = new WorkflowEngine();
    const def = makeDefinition({
      nodes: [
        makeNode("start", "start"),
        makeNode("act", "action", {}),
        makeNode("end", "end"),
      ],
      edges: [makeEdge("start", "act"), makeEdge("act", "end")],
    });
    const instance = await engine.startWorkflow(def, {}, "u1");
    expect(instance.status).toBe("failed");
    expect(instance.errorMessage).toBe("动作节点缺少actionType配置");
  });

  it("动作节点未知 actionType → failed", async () => {
    const engine = new WorkflowEngine();
    const def = makeDefinition({
      nodes: [
        makeNode("start", "start"),
        makeNode("act", "action", { actionType: "no-such-action" }),
        makeNode("end", "end"),
      ],
      edges: [makeEdge("start", "act"), makeEdge("act", "end")],
    });
    const instance = await engine.startWorkflow(def, {}, "u1");
    expect(instance.status).toBe("failed");
    expect(instance.errorMessage).toBe("未知的动作类型: no-such-action");
  });

  it("未知节点类型 → failed", async () => {
    const engine = new WorkflowEngine();
    const def = makeDefinition({
      nodes: [
        makeNode("start", "start"),
        // @ts-expect-error 故意传入未知类型测试运行时报错
        makeNode("weird", "unknown_type"),
        makeNode("end", "end"),
      ],
      edges: [makeEdge("start", "weird"), makeEdge("weird", "end")],
    });
    const instance = await engine.startWorkflow(def, {}, "u1");
    expect(instance.status).toBe("failed");
    expect(instance.errorMessage).toBe("未知的节点类型: unknown_type");
  });

  it("边指向不存在的节点 → failed", async () => {
    const engine = new WorkflowEngine();
    const def = makeDefinition({
      nodes: [makeNode("start", "start"), makeNode("end", "end")],
      edges: [makeEdge("start", "missing-node")],
    });
    const instance = await engine.startWorkflow(def, {}, "u1");
    expect(instance.status).toBe("failed");
    expect(instance.errorMessage).toBe("节点不存在: missing-node");
  });
});

// ============================================================================
// 节点类型分发
// ============================================================================

describe("节点类型分发", () => {
  it("wait 节点直接通过（简化跳过）", async () => {
    const engine = new WorkflowEngine();
    const def = makeDefinition({
      nodes: [makeNode("start", "start"), makeNode("w", "wait"), makeNode("end", "end")],
      edges: [makeEdge("start", "w"), makeEdge("w", "end")],
    });
    const instance = await engine.startWorkflow(def, {}, "u1");
    expect(instance.status).toBe("completed");
  });

  it("parallel 节点顺序执行通过（简化版）", async () => {
    const engine = new WorkflowEngine();
    const def = makeDefinition({
      nodes: [makeNode("start", "start"), makeNode("p", "parallel"), makeNode("end", "end")],
      edges: [makeEdge("start", "p"), makeEdge("p", "end")],
    });
    const instance = await engine.startWorkflow(def, {}, "u1");
    expect(instance.status).toBe("completed");
  });

  it("subflow 节点直接通过（简化版）", async () => {
    const engine = new WorkflowEngine();
    const def = makeDefinition({
      nodes: [makeNode("start", "start"), makeNode("s", "subflow"), makeNode("end", "end")],
      edges: [makeEdge("start", "s"), makeEdge("s", "end")],
    });
    const instance = await engine.startWorkflow(def, {}, "u1");
    expect(instance.status).toBe("completed");
  });

  it("无出边的非结束节点 → 视为完成", async () => {
    // start 没有出边 → while 循环 getNextNodeId 返回 undefined → completed
    const engine = new WorkflowEngine();
    const def = makeDefinition({
      nodes: [makeNode("start", "start"), makeNode("end", "end")],
      edges: [],
    });
    const instance = await engine.startWorkflow(def, {}, "u1");
    expect(instance.status).toBe("completed");
  });
});

// ============================================================================
// 内置动作处理器输出
// ============================================================================

describe("内置动作处理器输出", () => {
  async function runAction(actionType: string, config: Record<string, any> = {}) {
    const engine = new WorkflowEngine();
    const def = makeDefinition({
      nodes: [
        makeNode("start", "start"),
        makeNode("act", "action", { actionType, ...config }),
        makeNode("end", "end"),
      ],
      edges: [makeEdge("start", "act"), makeEdge("act", "end")],
    });
    return engine.startWorkflow(def, {}, "u1");
  }

  it("send_notification → { notificationSent: true }", async () => {
    const instance = await runAction("send_notification", { title: "hi" });
    expect(instance.status).toBe("completed");
    expect(instance.variables.notificationSent).toBe(true);
  });

  it("call_webhook → { webhookCalled: true }", async () => {
    const instance = await runAction("call_webhook", { url: "https://example.com" });
    expect(instance.status).toBe("completed");
    expect(instance.variables.webhookCalled).toBe(true);
  });

  it("ai_summarize → { summarized: true }", async () => {
    const instance = await runAction("ai_summarize");
    expect(instance.status).toBe("completed");
    expect(instance.variables.summarized).toBe(true);
  });

  it("ai_generate_tags → { tagsGenerated: true }", async () => {
    const instance = await runAction("ai_generate_tags");
    expect(instance.status).toBe("completed");
    expect(instance.variables.tagsGenerated).toBe(true);
  });

  it("move_file → { moved: true }", async () => {
    const instance = await runAction("move_file", { targetFolder: "f1" });
    expect(instance.status).toBe("completed");
    expect(instance.variables.moved).toBe(true);
  });

  it("http_request → { requestSent: true }", async () => {
    const instance = await runAction("http_request", { method: "GET", url: "https://x" });
    expect(instance.status).toBe("completed");
    expect(instance.variables.requestSent).toBe(true);
  });

  it("delay(duration:0) → { delayed: true, duration: 0 }（?? 保留零延迟，回归原 || bug）", async () => {
    // 修复前 handleDelay 用 `config.duration || 1000`，duration:0 被当 falsy 回退到 1000ms；
    // 修复后改用 `??`，0 作为合法零延迟被保留。
    const instance = await runAction("delay", { duration: 0 });
    expect(instance.status).toBe("completed");
    expect(instance.variables.delayed).toBe(true);
    expect(instance.variables.duration).toBe(0);
  });
});

// ============================================================================
// 条件分支 getNextNodeId + evaluateCondition
// ============================================================================

describe("条件分支", () => {
  /**
   * 构造分支工作流：start → condition --(condA)--> branchA → end
   *                                  --(condB)--> branchB → end
   * branchA/branchB 为自定义 action，执行后向 sink 写入走了哪条分支。
   */
  function branchWorkflow(
    condA: string,
    condB: string,
    variables: Record<string, any>,
    sink: Record<string, any>
  ): { engine: WorkflowEngine; def: WorkflowDefinition } {
    const engine = new WorkflowEngine();
    engine.registerActionHandler("go-a", async () => {
      sink.taken = "A";
      return { taken: "A" };
    });
    engine.registerActionHandler("go-b", async () => {
      sink.taken = "B";
      return { taken: "B" };
    });
    const def = makeDefinition({
      nodes: [
        makeNode("start", "start"),
        makeNode("cond", "condition"),
        makeNode("a", "action", { actionType: "go-a" }),
        makeNode("b", "action", { actionType: "go-b" }),
        makeNode("end", "end"),
      ],
      edges: [
        makeEdge("start", "cond"),
        makeEdge("cond", "a", condA),
        makeEdge("cond", "b", condB),
        makeEdge("a", "end"),
        makeEdge("b", "end"),
      ],
    });
    return { engine, def };
  }

  it("条件 A 满足 → 走 A 分支", async () => {
    const sink: Record<string, any> = {};
    const { engine, def } = branchWorkflow("{{x}} > 5", "{{x}} < 5", {}, sink);
    const instance = await engine.startWorkflow(def, { x: 10 }, "u1");
    expect(instance.status).toBe("completed");
    expect(sink.taken).toBe("A");
  });

  it("条件 B 满足 → 走 B 分支", async () => {
    const sink: Record<string, any> = {};
    const { engine, def } = branchWorkflow("{{x}} > 5", "{{x}} < 5", {}, sink);
    const instance = await engine.startWorkflow(def, { x: 3 }, "u1");
    expect(instance.status).toBe("completed");
    expect(sink.taken).toBe("B");
  });

  it("无任何条件满足 → 回退到第一条出边（A）", async () => {
    const sink: Record<string, any> = {};
    // x=5：既不 >5 也不 <5
    const { engine, def } = branchWorkflow("{{x}} > 5", "{{x}} < 5", {}, sink);
    const instance = await engine.startWorkflow(def, { x: 5 }, "u1");
    expect(instance.status).toBe("completed");
    expect(sink.taken).toBe("A");
  });

  it("条件节点无边带 condition → 直接取第一条出边", async () => {
    const sink: Record<string, any> = {};
    const engine = new WorkflowEngine();
    engine.registerActionHandler("go-a", async () => {
      sink.taken = "A";
      return { taken: "A" };
    });
    engine.registerActionHandler("go-b", async () => {
      sink.taken = "B";
      return { taken: "B" };
    });
    const def = makeDefinition({
      nodes: [
        makeNode("start", "start"),
        makeNode("cond", "condition"),
        makeNode("a", "action", { actionType: "go-a" }),
        makeNode("b", "action", { actionType: "go-b" }),
        makeNode("end", "end"),
      ],
      edges: [
        makeEdge("start", "cond"),
        makeEdge("cond", "a"),
        makeEdge("cond", "b"),
        makeEdge("a", "end"),
        makeEdge("b", "end"),
      ],
    });
    const instance = await engine.startWorkflow(def, {}, "u1");
    expect(instance.status).toBe("completed");
    expect(sink.taken).toBe("A");
  });

  it("非条件节点有多条出边 → 取第一条", async () => {
    // start 有两条出边（普通节点不评估 condition，取第一条）
    const sink: Record<string, any> = {};
    const engine = new WorkflowEngine();
    engine.registerActionHandler("go-a", async () => {
      sink.taken = "A";
      return { taken: "A" };
    });
    engine.registerActionHandler("go-b", async () => {
      sink.taken = "B";
      return { taken: "B" };
    });
    const def = makeDefinition({
      nodes: [
        makeNode("start", "start"),
        makeNode("a", "action", { actionType: "go-a" }),
        makeNode("b", "action", { actionType: "go-b" }),
        makeNode("end", "end"),
      ],
      edges: [
        makeEdge("start", "a"),
        makeEdge("start", "b"),
        makeEdge("a", "end"),
        makeEdge("b", "end"),
      ],
    });
    const instance = await engine.startWorkflow(def, {}, "u1");
    expect(instance.status).toBe("completed");
    expect(sink.taken).toBe("A");
  });
});

// ============================================================================
// evaluateCondition 表达式求值（经条件分支间接验证）
// ============================================================================

describe("evaluateCondition 运算符与变量替换", () => {
  /**
   * 通过条件分支间接验证 evaluateCondition 返回值。
   * 布局：start → cond --(永假条件)--> no  → end
   *                    cond --(待测条件)--> yes → end
   * 第一条边为 no（永假），第二条边为 yes（待测条件）。
   * 待测条件为真 → 走 yes；为假 → 无匹配回退第一条边 = no。可区分真假。
   */
  async function conditionResult(condition: string, variables: Record<string, any>): Promise<boolean> {
    const sink: Record<string, any> = {};
    const engine = new WorkflowEngine();
    engine.registerActionHandler("yes", async () => {
      sink.taken = "yes";
      return { taken: "yes" };
    });
    engine.registerActionHandler("no", async () => {
      sink.taken = "no";
      return { taken: "no" };
    });
    const def = makeDefinition({
      nodes: [
        makeNode("start", "start"),
        makeNode("cond", "condition"),
        makeNode("no", "action", { actionType: "no" }),
        makeNode("yes", "action", { actionType: "yes" }),
        makeNode("end", "end"),
      ],
      edges: [
        makeEdge("start", "cond"),
        // 第一条边永假（不存在的变量，未替换 → JSON.parse 失败 → 字符串比较 → 不等）
        makeEdge("cond", "no", "{{__never__}} == __sentinel__"),
        makeEdge("cond", "yes", condition),
        makeEdge("no", "end"),
        makeEdge("yes", "end"),
      ],
    });
    await engine.startWorkflow(def, variables, "u1");
    return sink.taken === "yes";
  }

  it("{{var}} 替换 + == 数值相等为真", async () => {
    expect(await conditionResult("{{x}} == 5", { x: 5 })).toBe(true);
  });

  it("== 数值不等为假", async () => {
    expect(await conditionResult("{{x}} == 5", { x: 6 })).toBe(false);
  });

  it("!= 不等为真", async () => {
    expect(await conditionResult("{{x}} != 5", { x: 6 })).toBe(true);
  });

  it("!= 相等为假", async () => {
    expect(await conditionResult("{{x}} != 5", { x: 5 })).toBe(false);
  });

  it("> 大于为真", async () => {
    expect(await conditionResult("{{x}} > 3", { x: 5 })).toBe(true);
  });

  it("> 不大于为假", async () => {
    expect(await conditionResult("{{x}} > 5", { x: 5 })).toBe(false);
  });

  it("< 小于为真", async () => {
    expect(await conditionResult("{{x}} < 9", { x: 5 })).toBe(true);
  });

  it("< 不小于为假", async () => {
    expect(await conditionResult("{{x}} < 5", { x: 5 })).toBe(false);
  });

  it("字符串相等比较（引号包裹）为真", async () => {
    expect(await conditionResult('{{name}} == "alice"', { name: "alice" })).toBe(true);
  });

  it("字符串相等比较不等为假", async () => {
    expect(await conditionResult('{{name}} == "alice"', { name: "bob" })).toBe(false);
  });

  it("无法解析为比较表达式的条件 → false（走回退边）", async () => {
    expect(await conditionResult("just some text", { x: 5 })).toBe(false);
  });

  it("变量未提供时模板不替换，表达式不匹配 → false", async () => {
    expect(await conditionResult("{{missing}} == 1", {})).toBe(false);
  });
});
