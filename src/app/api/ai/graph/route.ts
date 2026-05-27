import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';

let zaiInstance: Awaited<ReturnType<typeof ZAI.create>> | null = null;

async function getZAI() {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create();
  }
  return zaiInstance;
}

interface GraphFile {
  id: string;
  fileName: string;
  textContent?: string;
  tags: string[];
  fileType: string;
}

interface GraphNode {
  id: string;
  label: string;
  type: string;
  size: number;
}

interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  label: string;
}

// Fallback: build graph relationships using tags and file types
function buildFallbackGraph(files: GraphFile[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodeMap = new Map<string, GraphNode>();
  const edgeSet = new Set<string>();
  const edges: GraphEdge[] = [];

  // Create nodes
  for (const file of files) {
    nodeMap.set(file.id, {
      id: file.id,
      label: file.fileName.length > 20 ? file.fileName.slice(0, 17) + '...' : file.fileName,
      type: file.fileType,
      size: 1, // Will be updated based on connections
    });
  }

  // Build edges based on shared tags
  for (let i = 0; i < files.length; i++) {
    for (let j = i + 1; j < files.length; j++) {
      const a = files[i];
      const b = files[j];

      if (a.id === b.id) continue;

      const sharedTags = (a.tags || []).filter((t) => (b.tags || []).includes(t));
      const sameType = a.fileType === b.fileType;

      if (sharedTags.length > 0) {
        const edgeKey = [a.id, b.id].sort().join('::');
        if (!edgeSet.has(edgeKey)) {
          edgeSet.add(edgeKey);
          const weight = Math.min(sharedTags.length * 2, 10);
          edges.push({
            source: a.id,
            target: b.id,
            weight,
            label: sharedTags.slice(0, 2).join(', '),
          });
        }
      }

      if (sameType && sharedTags.length === 0) {
        const edgeKey = [a.id, b.id].sort().join('::');
        if (!edgeSet.has(edgeKey)) {
          edgeSet.add(edgeKey);
          edges.push({
            source: a.id,
            target: b.id,
            weight: 1,
            label: '相同类型',
          });
        }
      }
    }
  }

  // Update node sizes based on connection count
  const connectionCounts = new Map<string, number>();
  for (const edge of edges) {
    connectionCounts.set(edge.source, (connectionCounts.get(edge.source) || 0) + 1);
    connectionCounts.set(edge.target, (connectionCounts.get(edge.target) || 0) + 1);
  }

  const nodes = Array.from(nodeMap.values()).map((node) => ({
    ...node,
    size: Math.max(1, (connectionCounts.get(node.id) || 0)),
  }));

  return { nodes, edges };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { files } = body;

    if (!files || !Array.isArray(files) || files.length < 2) {
      return NextResponse.json(
        { error: '至少需要2个文件才能生成知识图谱' },
        { status: 400 }
      );
    }

    const graphFiles: GraphFile[] = files.map((f: Partial<GraphFile>) => ({
      id: f.id || '',
      fileName: f.fileName || '未命名',
      textContent: f.textContent || '',
      tags: Array.isArray(f.tags) ? f.tags : [],
      fileType: f.fileType || 'other',
    })).filter((f: GraphFile) => f.id);

    if (graphFiles.length < 2) {
      return NextResponse.json(
        { error: '有效文件不足2个' },
        { status: 400 }
      );
    }

    // Try AI analysis first
    try {
      const zai = await getZAI();

      const fileListStr = graphFiles
        .slice(0, 50)
        .map((f, i) => {
          const contentPreview = (f.textContent || '').slice(0, 150);
          const tagsStr = (f.tags || []).join(', ');
          return `[${i}] ID:${f.id} | 名称:${f.fileName} | 类型:${f.fileType} | 标签:${tagsStr || '(无)'} | 内容:${contentPreview || '(无)'}`;
        })
        .join('\n');

      const prompt = `分析以下文件之间的关系，返回节点和边的JSON。节点是文件，边表示关联关系（共享标签、相似内容、相同类型等）。

文件列表：
${fileListStr}

请返回如下JSON格式（不要包含任何其他内容）：
{
  "nodes": [{"id":"文件ID","label":"文件名","type":"文件类型","size":连接数}],
  "edges": [{"source":"源文件ID","target":"目标文件ID","weight":1-10关联强度,"label":"关系描述"}]
}

规则：
- nodes包含所有文件，label不超过20个字符
- size基于该节点的连接数量（至少为1）
- edges最多返回每对文件之间最强的一条关系
- weight范围1-10，数值越大关系越强
- label用简短中文描述关系原因（如"共享标签：旅行"、"相同类型"、"内容相似"等）
- 如果文件之间无明显关联，不需要添加边
- 最多返回100条边`;

      const completion = await zai.chat.completions.create({
        messages: [
          { role: 'system', content: '你是一个知识图谱分析助手，分析文件间关系并返回结构化JSON数据。' },
          { role: 'user', content: prompt },
        ],
      });

      const responseText = completion.choices[0]?.message?.content || '';

      let parsed: { nodes?: GraphNode[]; edges?: GraphEdge[] };

      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON found');
        }
      } catch {
        throw new Error('Failed to parse AI response');
      }

      const nodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
      const edges = Array.isArray(parsed.edges) ? parsed.edges : [];

      // Validate and ensure all files are represented as nodes
      const existingIds = new Set(nodes.map((n) => n.id));
      for (const file of graphFiles) {
        if (!existingIds.has(file.id)) {
          nodes.push({
            id: file.id,
            label: file.fileName.length > 20 ? file.fileName.slice(0, 17) + '...' : file.fileName,
            type: file.fileType,
            size: 1,
          });
        }
      }

      return NextResponse.json({ nodes, edges, source: 'ai' });
    } catch (aiError) {
      console.error('AI graph analysis failed, using fallback:', aiError);
      // Fallback to tag-based and type-based relationships
      const result = buildFallbackGraph(graphFiles);
      return NextResponse.json({ ...result, source: 'fallback' });
    }
  } catch (error) {
    console.error('Graph API error:', error);
    return NextResponse.json(
      { error: '生成知识图谱失败' },
      { status: 500 }
    );
  }
}
