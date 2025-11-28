import { GoogleGenAI, Content, Modality } from "@google/genai";
import { Message, Sender, GradeLevel, Subject, Attachment } from "../types";
import { getCurriculumFor } from "../curriculum"; // ← التعديل الصحيح هنا فقط

const SYSTEM_INSTRUCTION = `
أنت نظام تعليم ذكي متخصص لطلاب الثانوية العامة المصرية (الصفوف: الأول، الثاني، والثالث).

**فلسفة العمل الجديدة**: "خير الكلام ما قل ودل".
مهمتك هي تقديم المعلومات الدراسية بشكل **مختصر جداً، مركز، ومنظم**.

**التعليمات الصارمة**:
1. **الاختصار**: تجنب الشرح المطول والسرد الإنشائي.
2. **العناصر**: اعتمد على القوائم النقطية (Bullet Points) لعرض المعلومات.
3. **المباشرة**: أجب عن السؤال فوراً دون مقدمات طويلة.
4. **التلخيص**: قدم "الزبدة" أو الخلاصة المفيدة للامتحان.

**الرسوم البيانية والمخططات (مهم جداً)**:
عندما يتضمن الشرح علاقة بيانية أو إحصائية (مثل: قانون أوم، المنحنيات، العلاقات الطردية والعكسية)، **يجب** عليك إنشاء كود JSON للرسم البياني.
اكتب كود JSON فقط داخل بلوك \`chart\` وبدون أي تعليقات نهائياً.

قواعد JSON الصارمة:
1. استخدم علامات التنصيص المزدوجة " " فقط للمفاتيح والقيم النصية.
2. لا تضع فواصل , في نهاية القوائم أو الكائنات.
3. لا تضع أي تعليقات داخل الـ JSON.
4. تأكد أن الأرقام مكتوبة كأرقام.
`;

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

export interface GenerationOptions {
  useThinking?: boolean;
  useSearch?: boolean;
}

// ================== STREAM TEXT RESPONSE ==================
export const generateStreamResponse = async (
  userMessage: string,
  grade: GradeLevel,
  subject: Subject,
  history: Message[],
  onChunk: (text: string) => void,
  attachment?: Attachment,
  options?: GenerationOptions
): Promise<string> => {

  const chatHistory: Content[] = history.map((msg) => ({
    role: msg.sender === Sender.USER ? 'user' : 'model',
    parts: [{ text: msg.text }],
  }));

  const curriculumList = getCurriculumFor(grade, subject);
  const curriculumString = curriculumList.length > 0 
    ? curriculumList.join('\n- ') 
    : 'المنهج الرسمي لوزارة التربية والتعليم المصرية لهذا الصف.';

  const dynamicInstruction = SYSTEM_INSTRUCTION
    .replace('[GRADE_LEVEL]', grade)
    .replace('[SUBJECT]', subject)
    .replace('[CURRICULUM_LIST]', curriculumString);

  try {
    let model = 'gemini-2.5-flash';
    let config: any = {
      systemInstruction: dynamicInstruction,
      temperature: 0.7,
    };

    if (options?.useThinking) {
      model = 'gemini-3-pro-preview';
      config.thinkingConfig = { thinkingBudget: 32768 };
    } else {
      config.maxOutputTokens = 2000;
      config.thinkingConfig = { thinkingBudget: 0 };
    }

    if (options?.useSearch && !options?.useThinking) {
      config.tools = [{ googleSearch: {} }];
    }

    const chat = ai.chats.create({
      model,
      config,
      history: chatHistory,
    });

    let messageParts: any[] = [];

    if (attachment) {
      messageParts.push({
        inlineData: {
          mimeType: attachment.mimeType,
          data: attachment.data,
        },
      });
    }

    let promptText = userMessage;
    if (!promptText.trim() && attachment) {
      if (attachment.type === 'audio') promptText = "لخص ما في هذا التسجيل.";
      else if (attachment.type === 'image') promptText = "لخص ما في الصورة.";
      else promptText = "لخص هذا الملف.";
    }

    messageParts.push({ text: promptText });

    const resultStream = await chat.sendMessageStream({ message: messageParts });

    let fullText = '';
    const groundingSources: Set<string> = new Set();

    for await (const chunk of resultStream) {
      const chunkText = chunk.text || '';
      fullText += chunkText;

      if (chunk.candidates?.[0]?.groundingMetadata?.groundingChunks) {
        chunk.candidates[0].groundingMetadata.groundingChunks.forEach((c: any) => {
          if (c.web?.uri) {
            groundingSources.add(`[${c.web.title || 'مصدر'}](${c.web.uri})`);
          }
        });
      }

      onChunk(fullText);
    }

    if (groundingSources.size > 0) {
      const sourcesText = "\n\n**المصادر:**\n" + Array.from(groundingSources).map(s => `- ${s}`).join('\n');
      fullText += sourcesText;
      onChunk(fullText);
    }

    return fullText;

  } catch (error) {
    console.error("Gemini API Error:", error);
    return "عذراً، حدث خطأ أثناء معالجة طلبك.";
  }
};

// ================== TEXT TO SPEECH ==================
export const generateSpeech = async (text: string): Promise<string | null> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
  } catch (error) {
    console.error("TTS Error:", error);
    return null;
  }
};

// ================== STREAM TTS ==================
export const streamSpeech = async (
  text: string,
  onAudioChunk: (base64: string) => void
): Promise<void> => {
  try {
    const responseStream = await ai.models.generateContentStream({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    for await (const chunk of responseStream) {
      const audioData = chunk.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (audioData) {
        onAudioChunk(audioData);
      }
    }
  } catch (error) {
    console.error("TTS Stream Error:", error);
  }
};

