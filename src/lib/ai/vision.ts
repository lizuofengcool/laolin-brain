import ZAI from 'z-ai-web-dev-sdk';

let zaiInstance: Awaited<ReturnType<typeof ZAI.create>> | null = null;

async function getZAI() {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create();
  }
  return zaiInstance;
}

// Image description - identify scene content (scene, objects, people actions, etc.)
export async function describeImage(imageBase64: string): Promise<string> {
  try {
    const zai = await getZAI();
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content:
            '你是一个图像描述助手。请用中文简要描述图片中的内容，包括场景、物品、人物、动作等。用逗号分隔关键词。例如："室内,办公桌,笔记本电脑,文档,日光"。只输出关键词，不要输出其他内容。',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: '请描述这张图片' },
            {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
            },
          ] as unknown as string,
        },
      ],
    });
    return completion.choices[0]?.message?.content || '';
  } catch (e) {
    console.error('Image description failed:', e);
    return '';
  }
}

// OCR - extract text from image
export async function extractTextFromImage(
  imageBase64: string
): Promise<string> {
  try {
    const zai = await getZAI();
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content:
            '你是一个OCR文字识别助手。请仔细识别图片中的所有文字内容，原样输出。如果图片中没有文字，回复"无文字"。',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: '请提取图片中的所有文字' },
            {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
            },
          ] as unknown as string,
        },
      ],
    });
    return completion.choices[0]?.message?.content || '';
  } catch (e) {
    console.error('OCR failed:', e);
    return '';
  }
}

// Document Q&A
export async function askAboutDocument(
  content: string,
  question: string
): Promise<string> {
  try {
    const zai = await getZAI();
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content:
            '你是一个文档分析助手。根据提供的文档内容回答用户的问题。用中文回答，简洁明了。',
        },
        {
          role: 'user',
          content: `文档内容：\n${content}\n\n问题：${question}`,
        },
      ],
    });
    return completion.choices[0]?.message?.content || '无法回答此问题。';
  } catch (e) {
    console.error('Document Q&A failed:', e);
    return 'AI 服务暂时不可用，请稍后再试。';
  }
}

// Image Q&A
export async function askAboutImage(
  imageBase64: string,
  question: string
): Promise<string> {
  try {
    const zai = await getZAI();
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content:
            '你是一个图片分析助手。根据图片内容回答用户的问题。用中文回答，简洁明了。',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: question },
            {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
            },
          ] as unknown as string,
        },
      ],
    });
    return completion.choices[0]?.message?.content || '无法回答此问题。';
  } catch (e) {
    console.error('Image Q&A failed:', e);
    return 'AI 服务暂时不可用，请稍后再试。';
  }
}
