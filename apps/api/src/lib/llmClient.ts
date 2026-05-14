// LLM 클라이언트 — provider-agnostic.
//
// env 기반:
//   LLM_PROVIDER=anthropic|openai|gemini|none   (기본: none)
//   LLM_API_KEY=...
//   LLM_MODEL=...                                 (옵션)
//
// LLM_PROVIDER가 "none"이거나 키가 없으면 모든 함수가 null을 반환 (graceful fallback).
// 호출자는 fallback 휴리스틱을 사용해야 함.
//
// Gemini는 SDK 없이 fetch 호출로 처리하여 의존성 추가 없음.

export type LlmProvider = "anthropic" | "openai" | "gemini" | "none";

interface ArticleForCluster {
  id: string;
  title: string;
  excerpt: string | null;
}

interface ArticleForAnalysis {
  url: string;
  title: string;
  excerpt: string | null;
}

export interface ArticleAnalysis {
  stance: "claim" | "explanation" | "neutral";
  hasPrimarySource: boolean;
  hasCorrection: boolean;
}

export interface TopicSummary {
  title: string;
  summary: string;
  category: string;
}

function getProvider(): LlmProvider {
  const raw = (process.env.LLM_PROVIDER ?? "none").toLowerCase().trim();
  if (raw === "anthropic" || raw === "openai" || raw === "gemini") return raw;
  // "google" 별칭도 gemini로 처리
  if (raw === "google") return "gemini";
  return "none";
}

function getApiKey(): string | null {
  const key = process.env.LLM_API_KEY;
  return key && key.trim().length > 0 ? key.trim() : null;
}

function getModel(provider: LlmProvider): string {
  const explicit = process.env.LLM_MODEL?.trim();
  if (explicit) return explicit;
  if (provider === "anthropic") return "claude-haiku-4-5";
  if (provider === "openai") return "gpt-4o-mini";
  if (provider === "gemini") return "gemini-2.0-flash";
  return "";
}

export function isLlmEnabled(): boolean {
  return getProvider() !== "none" && getApiKey() !== null;
}

// ── Anthropic / OpenAI 호출 (lazy import) ──────────────────────

async function callJson<T>(prompt: string, schemaHint: string): Promise<T | null> {
  const provider = getProvider();
  const apiKey = getApiKey();
  if (provider === "none" || !apiKey) return null;
  const model = getModel(provider);
  const systemMsg =
    "You are a careful Korean-language analyst. Always reply with VALID JSON only — no prose, no markdown. " +
    `JSON schema: ${schemaHint}`;
  try {
    if (provider === "anthropic") {
      // 동적 import — 패키지가 설치되어 있을 때만 활성화. 타입은 우회.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod: any = await import(
        /* @vite-ignore */ "@anthropic-ai/sdk" as string
      ).catch(() => null);
      if (!mod) {
        console.warn(
          "[llmClient] LLM_PROVIDER=anthropic but @anthropic-ai/sdk not installed; install it to enable.",
        );
        return null;
      }
      const Anthropic = mod.default ?? mod.Anthropic ?? mod;
      const client = new Anthropic({ apiKey });
      const resp = await client.messages.create({
        model,
        max_tokens: 1024,
        system: systemMsg,
        messages: [{ role: "user", content: prompt }],
      });
      const block = resp.content[0];
      if (!block || block.type !== "text") return null;
      return parseJson<T>(block.text);
    }
    if (provider === "openai") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod: any = await import(
        /* @vite-ignore */ "openai" as string
      ).catch(() => null);
      if (!mod) {
        console.warn(
          "[llmClient] LLM_PROVIDER=openai but openai not installed; install it to enable.",
        );
        return null;
      }
      const OpenAI = mod.default ?? mod.OpenAI ?? mod;
      const client = new OpenAI({ apiKey });
      const resp = await client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemMsg },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      });
      const text = resp.choices[0]?.message?.content ?? null;
      if (!text) return null;
      return parseJson<T>(text);
    }
    if (provider === "gemini") {
      // Google Gemini는 SDK 없이 fetch로 호출. v1beta generateContent 엔드포인트.
      const url =
        `https://generativelanguage.googleapis.com/v1beta/models/` +
        `${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const body = {
        systemInstruction: { parts: [{ text: systemMsg }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.3,
        },
      };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.warn(
          `[llmClient] Gemini call failed: ${res.status} ${errText.slice(0, 200)}`,
        );
        return null;
      }
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
      if (!text) return null;
      return parseJson<T>(text);
    }
  } catch (err) {
    // LLM 실패는 fallback으로 떨어뜨림. 로그만 남김.
    console.warn("[llmClient] call failed:", err instanceof Error ? err.message : err);
    return null;
  }
  return null;
}

function parseJson<T>(text: string): T | null {
  // 모델이 코드 펜스로 감쌀 수 있으니 처리.
  const trimmed = text.trim();
  const stripped = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(stripped) as T;
  } catch {
    return null;
  }
}

// ── 1. 토픽 클러스터링 ────────────────────────────────────────

export async function clusterArticlesIntoTopics(
  articles: ArticleForCluster[],
): Promise<Map<string, string[]> | null> {
  if (!isLlmEnabled() || articles.length === 0) return null;
  const payload = articles.map((a) => ({
    id: a.id,
    title: a.title,
    excerpt: (a.excerpt ?? "").slice(0, 300),
  }));
  const prompt =
    "다음 한국 정치 뉴스 기사 목록을 비슷한 사건/주제별로 묶어주세요. " +
    "각 그룹마다 짧은 한국어 제목을 붙이세요. 같은 주제만 같은 그룹에 넣고, " +
    "관계 없는 기사는 각각 별도 그룹으로 두세요.\n\n" +
    `기사 목록 (JSON): ${JSON.stringify(payload, null, 2)}\n\n` +
    "응답 JSON: { \"groups\": [ { \"title\": \"...\", \"articleIds\": [\"id1\", ...] }, ... ] }";
  const schema = "{ groups: { title: string, articleIds: string[] }[] }";
  type Resp = { groups?: { title?: string; articleIds?: string[] }[] };
  const resp = await callJson<Resp>(prompt, schema);
  if (!resp || !Array.isArray(resp.groups)) return null;
  const out = new Map<string, string[]>();
  for (const g of resp.groups) {
    if (!g.title || !Array.isArray(g.articleIds) || g.articleIds.length === 0) continue;
    out.set(g.title, g.articleIds.filter((id) => typeof id === "string"));
  }
  return out.size > 0 ? out : null;
}

// ── 2. 토픽 요약 ──────────────────────────────────────────────

export async function summarizeTopic(
  topicArticles: ArticleForAnalysis[],
): Promise<TopicSummary | null> {
  if (!isLlmEnabled() || topicArticles.length === 0) return null;
  const payload = topicArticles.slice(0, 8).map((a) => ({
    source: a.url,
    title: a.title,
    excerpt: (a.excerpt ?? "").slice(0, 500),
  }));
  const prompt =
    "아래 같은 사건을 다루는 기사 묶음입니다. 한국어로 중립적인 1~3문장 요약을 만드세요. " +
    "단정적인 사실 판단(\"거짓\", \"허위\")은 쓰지 말고, '~라고 보도됐다', '~라는 주장이 제기됐다' 같은 표현을 사용하세요. " +
    "카테고리는 '발언', '정책', '사법', '재산·이해충돌', '선거', '기타' 중 하나로 분류하세요.\n\n" +
    `기사: ${JSON.stringify(payload, null, 2)}\n\n` +
    "응답 JSON: { \"title\": \"짧은 토픽 제목\", \"summary\": \"1-3 문장\", \"category\": \"카테고리\" }";
  const schema = "{ title: string, summary: string, category: string }";
  const resp = await callJson<TopicSummary>(prompt, schema);
  if (!resp || !resp.title || !resp.summary || !resp.category) return null;
  return resp;
}

// ── 3. 기사별 라벨링 ──────────────────────────────────────────

export async function analyzeArticle(
  article: ArticleForAnalysis,
): Promise<ArticleAnalysis | null> {
  if (!isLlmEnabled()) return null;
  const prompt =
    "아래 기사를 분류해주세요. 단정적 사실 판단은 하지 말고 구조적 신호만 보세요.\n" +
    "- stance: 'claim' (의혹 제기), 'explanation' (해명/반박), 'neutral' (사실 보도)\n" +
    "- hasPrimarySource: 1차 출처 (공식 문서, 녹취, 회의록, 본인 발언 인용) 명시 여부\n" +
    "- hasCorrection: 정정보도, 반박, 사과 표현 존재 여부\n\n" +
    `기사 제목: ${article.title}\n` +
    `본문 발췌: ${(article.excerpt ?? "").slice(0, 1200)}\n\n` +
    "응답 JSON: { \"stance\": \"...\", \"hasPrimarySource\": true|false, \"hasCorrection\": true|false }";
  const schema =
    "{ stance: 'claim'|'explanation'|'neutral', hasPrimarySource: boolean, hasCorrection: boolean }";
  const resp = await callJson<ArticleAnalysis>(prompt, schema);
  if (!resp) return null;
  if (
    resp.stance !== "claim" &&
    resp.stance !== "explanation" &&
    resp.stance !== "neutral"
  ) {
    return null;
  }
  if (typeof resp.hasPrimarySource !== "boolean") return null;
  if (typeof resp.hasCorrection !== "boolean") return null;
  return resp;
}
