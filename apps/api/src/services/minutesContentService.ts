// CLIK 회의록 본문 fetch / parse 서비스
//
// CLIK viewer URL: https://clik.nanet.go.kr/minutes/viewer.do?collection=minutes&DOCID={DOCID}
// 본문은 printpage.do 엔드포인트에 평문 HTML로 들어있다.
//   https://clik.nanet.go.kr/minutes/printpage.do?DOCID={DOCID}
//
// 본문 구조:
//   <div id='minutes'>
//     <ol id='agenda-block'> ... <li class='agenda_line'> ... </li> </ol>
//     <ol id='item-block'> ... 부의된 안건 </ol>
//     <div class='contents-block speaker-block ...'>
//       <strong>○{role} <a>{name}</a></strong>{speech}
//     </div>
//     ...
//   </div>
//
// 발언 패턴: <strong>○역할 이름</strong>발언내용
//   - 이름이 <a>로 감싸진 경우(의원) / 평문인 경우(공무원·외부인) 모두 처리.

import { JSDOM } from "jsdom";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import type { CouncilMinutes } from "@prisma/client";

const PRINTPAGE_URL = "https://clik.nanet.go.kr/minutes/printpage.do";
const USER_AGENT =
  "Mozilla/5.0 (compatible; clik-minutes-bot/1.0; +https://candidate.local)";

// 정중한 fetch 간격 (1초당 1회 이하)
let lastFetchAt = 0;
const MIN_INTERVAL_MS = 1100;

export interface MinutesContent {
  bodyHtml: string;
  bodyText: string;
  agenda: { ord: number; title: string }[];
  speakers: { role: string; name: string; totalChars: number }[];
}

async function politeWait(): Promise<void> {
  const now = Date.now();
  const diff = now - lastFetchAt;
  if (diff < MIN_INTERVAL_MS) {
    await new Promise((r) => setTimeout(r, MIN_INTERVAL_MS - diff));
  }
  lastFetchAt = Date.now();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function normalizeWhitespace(s: string): string {
  return s.replace(/[\s ]+/g, " ").trim();
}

/**
 * CLIK printpage.do 엔드포인트에서 회의록 본문 HTML을 가져와 파싱한다.
 */
export async function fetchMinutesContent(
  docId: string,
): Promise<MinutesContent> {
  await politeWait();
  const url = `${PRINTPAGE_URL}?DOCID=${encodeURIComponent(docId)}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) {
    throw new Error(
      `CLIK printpage fetch 실패: ${res.status} ${res.statusText}`,
    );
  }
  const html = await res.text();

  const dom = new JSDOM(html);
  const doc = dom.window.document;

  // ── #minutes 컨테이너 추출 ──
  const minutesEl = doc.getElementById("minutes");
  if (!minutesEl) {
    throw new Error("회의록 본문(#minutes) 컨테이너를 찾을 수 없습니다.");
  }
  const bodyHtml = minutesEl.outerHTML;

  // ── 의사일정 파싱 ──
  const agenda: { ord: number; title: string }[] = [];
  const agendaBlock = doc.getElementById("agenda-block");
  if (agendaBlock) {
    const lines = Array.from(agendaBlock.querySelectorAll("li.agenda_line"));
    for (const li of lines) {
      const txt = normalizeWhitespace(li.textContent ?? "");
      if (!txt) continue;
      // "1. 조례안(...) 의결의 건" 형태에서 ord 추출.
      const m = /^(\d+)\.\s*(.+)$/.exec(txt);
      if (m) {
        agenda.push({ ord: Number(m[1]), title: m[2].trim() });
      } else if (
        !txt.includes("의사일정") &&
        !li.classList.contains("font-bold")
      ) {
        // ord가 없는 항목은 스킵 (헤더)
      }
    }
  }

  // ── 발언자 추출 ──
  const speakerBlocks = Array.from(
    minutesEl.querySelectorAll("div.speaker-block"),
  );
  const speakerStats = new Map<string, { role: string; name: string; totalChars: number }>();

  for (const block of speakerBlocks) {
    const strong = block.querySelector("strong");
    if (!strong) continue;

    // strong 의 텍스트에서 ○{role} {name} 추출
    const strongText = normalizeWhitespace(strong.textContent ?? "");
    if (!strongText.startsWith("○")) continue;

    // ○ 이후를 split
    const headerText = strongText.replace(/^○\s*/, "");
    // 의원: "이상숙 의원" 또는 "○이상숙 의원" (의원이 뒤에 옴)
    // 의장: "의장 박두형"
    // 의사팀장: "의사팀장 박경준"
    const parsed = parseSpeakerHeader(headerText);
    if (!parsed) continue;

    // strong 이후 텍스트를 본문으로 (대략적인 길이 측정용)
    let speechLen = 0;
    let node = strong.nextSibling;
    while (node) {
      const t = node.textContent ?? "";
      speechLen += normalizeWhitespace(decodeEntities(t)).length;
      node = node.nextSibling;
    }

    const key = `${parsed.role}|${parsed.name}`;
    const existing = speakerStats.get(key);
    if (existing) {
      existing.totalChars += speechLen;
    } else {
      speakerStats.set(key, {
        role: parsed.role,
        name: parsed.name,
        totalChars: speechLen,
      });
    }
  }

  // 글자수 많은 순으로 정렬
  const speakers = Array.from(speakerStats.values()).sort(
    (a, b) => b.totalChars - a.totalChars,
  );

  // ── 정제된 텍스트 추출 ──
  // 발언자 블록을 "○{role} {name}: {speech}" 형태로 라인 단위 결합
  const lines: string[] = [];

  // 헤더 영역 (#minutes-header) 텍스트
  const header = doc.getElementById("minutes-header");
  if (header) {
    const headerText = normalizeWhitespace(header.textContent ?? "");
    if (headerText) lines.push(headerText);
  }

  // 의사일정 텍스트
  if (agenda.length > 0) {
    lines.push("\n[의사일정]");
    for (const a of agenda) {
      lines.push(`${a.ord}. ${a.title}`);
    }
  }

  // 발언 본문
  lines.push("\n[회의 내용]");
  for (const block of speakerBlocks) {
    const strong = block.querySelector("strong");
    if (!strong) continue;
    const strongText = normalizeWhitespace(strong.textContent ?? "");
    if (!strongText.startsWith("○")) continue;

    // strong 제거 후 본문만
    const blockClone = block.cloneNode(true) as HTMLElement;
    const s2 = blockClone.querySelector("strong");
    if (s2) s2.remove();
    // <br> → 개행으로 치환
    blockClone.querySelectorAll("br").forEach((br) => {
      br.replaceWith(doc.createTextNode("\n"));
    });
    const speech = normalizeWhitespace(blockClone.textContent ?? "");
    lines.push(`${strongText}: ${speech}`);
  }

  const bodyText = lines.join("\n").trim();

  return {
    bodyHtml,
    bodyText,
    agenda,
    speakers,
  };
}

/**
 * "{role} {name}" 또는 "{name} 의원" 형태를 파싱.
 * 반환: { role, name }
 */
function parseSpeakerHeader(text: string): { role: string; name: string } | null {
  // 출석의원 / 출석공무원 / 출석사무과직원 등은 발언자가 아님
  if (/^출석/.test(text)) return null;

  // "{name} 의원" — 의원 호칭 패턴 (의원이 뒤에 옴)
  const m1 = /^(\S+)\s+의원$/.exec(text);
  if (m1) {
    return { role: "의원", name: m1[1] };
  }

  // "{name}의원" — 공백 없는 경우
  const m1b = /^(\S+?)의원$/.exec(text);
  if (m1b) {
    return { role: "의원", name: m1b[1] };
  }

  // "{role} {name}" — 의장, 의사팀장, 부의장, 시장 등
  const m2 = /^(\S+?)\s+(\S+)$/.exec(text);
  if (m2) {
    return { role: m2[1], name: m2[2] };
  }

  // 단일 토큰 (이름만)
  if (text && !text.includes("위원회")) {
    return { role: "기타", name: text };
  }

  return null;
}

/**
 * 본문이 캐시되어 있으면 그대로 반환, 없으면 fetch+저장 후 반환.
 */
export async function getOrFetchMinutesContent(
  docId: string,
  options: { force?: boolean } = {},
): Promise<CouncilMinutes> {
  const existing = await prisma.councilMinutes.findUnique({ where: { docId } });
  if (!existing) {
    throw new Error(`회의록을 찾을 수 없습니다: ${docId}`);
  }

  if (!options.force && existing.bodyHtml && existing.bodyText) {
    return existing;
  }

  const content = await fetchMinutesContent(docId);

  const updated = await prisma.councilMinutes.update({
    where: { docId },
    data: {
      bodyHtml: content.bodyHtml,
      bodyText: content.bodyText,
      agendaJson: content.agenda as unknown as Prisma.InputJsonValue,
      speakersJson: content.speakers as unknown as Prisma.InputJsonValue,
      fetchedAt: new Date(),
    },
  });

  return updated;
}
