import ZAI from 'z-ai-web-dev-sdk';

let zaiInstance: Awaited<ReturnType<typeof ZAI.create>> | null = null;

async function getZAI() {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create();
  }
  return zaiInstance;
}

/** Create an AbortController with a 60-second timeout and return both the controller and a cleanup function. */
function createTimeoutController(timeoutMs: number = 60_000): { controller: AbortController; cleanup: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    controller,
    cleanup: () => clearTimeout(timer),
  };
}

export interface FaceDetection {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  description: string;
  embedding: number[];
}

/**
 * Detect faces in an image using AI vision capabilities.
 * Returns face bounding boxes, descriptions, and embeddings for clustering.
 */
export async function detectFaces(imageBase64: string): Promise<FaceDetection[]> {
  const { controller, cleanup } = createTimeoutController(60_000);
  try {
    const zai = await getZAI();

    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `你是一个专业的人脸检测AI助手。用户会给你一张图片，你需要：
1. 识别图片中的所有人脸
2. 为每张人脸提供：位置（归一化坐标 0-100）、描述（性别、年龄段、特征）、特征向量

严格按照以下JSON格式返回，不要返回其他任何内容：
[
  {
    "x": 左上角X坐标(0-100的整数),
    "y": 左上角Y坐标(0-100的整数),
    "width": 宽度(0-100的整数),
    "height": 高度(0-100的整数),
    "description": "性别,年龄段,特征描述，如：男性,25-35岁,戴眼镜,短发",
    "embedding": [32个浮点数构成的数组，范围0-1，描述面部特征]
  }
]

规则：
- x, y, width, height 都是0到100之间的整数，表示相对于图片尺寸的百分比
- description 用中文，简洁描述
- embedding 是32个0到1之间的浮点数，同一个人的不同照片应有相似的特征向量
- 如果没有检测到人脸，返回空数组 []
- 只返回JSON，不要其他文字`,
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: '请检测这张图片中的所有人脸' },
            {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
            },
          ] as unknown as string,
        },
      ],
      signal: controller.signal,
    });

    const content = completion.choices[0]?.message?.content || '[]';

    // Extract JSON from the response (handle cases where AI wraps in markdown)
    let jsonStr = content.trim();
    const jsonMatch = jsonStr.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    const faces = JSON.parse(jsonStr);

    if (!Array.isArray(faces)) return [];

    return faces.map((face: Record<string, unknown>, index: number) => ({
      id: crypto.randomUUID(),
      x: typeof face.x === 'number' ? Math.round(face.x) : 0,
      y: typeof face.y === 'number' ? Math.round(face.y) : 0,
      width: typeof face.width === 'number' ? Math.round(face.width) : 0,
      height: typeof face.height === 'number' ? Math.round(face.height) : 0,
      description: typeof face.description === 'string' ? face.description : '',
      embedding: Array.isArray(face.embedding)
        ? face.embedding.filter((v: unknown) => typeof v === 'number').slice(0, 32)
        : [],
    })).filter((f: FaceDetection) => f.width > 0 && f.height > 0);
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      console.error('Face detection timed out after 60 seconds');
      return [];
    }
    console.error('Face detection failed:', e);
    return [];
  } finally {
    cleanup();
  }
}
