import { authenticateRequest, AuthError } from '../_shared/authClient.ts';
import { callOpenAIJson } from '../_shared/openai.ts';
import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts';

interface RequestBody {
  completion_rate: number;
  incomplete_items: { subject_label: string; material: string; unit: string; page_range: string }[];
  most_postponed_subject_label: string | null;
  fatigue_high: boolean;
  tomorrow_free_gaps: { start: string; end: string; minutes: number }[];
  main_subject_labels: string[];
}

interface RecommendationItem {
  subject_label: string;
  study_type: 'concept' | 'practice' | 'memorize' | 'review';
  material: string;
  unit: string;
  page_range: string;
  difficulty: 'easy' | 'medium' | 'hard';
  must_do: boolean;
  start_time: string;
  end_time: string;
  estimated_minutes: number;
  reason: string;
}

interface RecommendationResult {
  reasons: string[];
  items: RecommendationItem[];
}

function isRecommendationResult(value: unknown): value is RecommendationResult {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.reasons) || !Array.isArray(v.items)) return false;
  return v.items.every((item) => {
    if (typeof item !== 'object' || item === null) return false;
    const i = item as Record<string, unknown>;
    return typeof i.subject_label === 'string' && typeof i.study_type === 'string' && typeof i.start_time === 'string' && typeof i.end_time === 'string';
  });
}

const SYSTEM_PROMPT = `당신은 중고등학생의 학습 코치입니다. 오늘 학습 실행 데이터를 참고해서 내일 학습 계획 초안(최대 4개 항목)을 만듭니다.
훈계하거나 평가하는 톤이 아니라, 옆에서 같이 고민해주는 따뜻한 톤으로 작성하세요.
- 오늘 미완료 항목이 있으면 우선 배치하세요.
- 자주 미루는 과목이 있으면 그 과목을 우선 배치하고 이유를 reasons에 남기세요.
- 오늘 피로도가 높았다면(fatigue_high=true) 난이도를 medium 이하로 제안하세요.
- 항목의 start_time/end_time은 반드시 tomorrow_free_gaps 안에 들어오게 배치하세요.
- 추천할 데이터가 부족하면 main_subject_labels 중 하나를 가볍게(easy, concept) 제안하세요.
반드시 다음 형식의 JSON으로만 답하세요:
{"reasons": ["..."], "items": [{"subject_label": "...", "study_type": "concept|practice|memorize|review", "material": "...", "unit": "...", "page_range": "...", "difficulty": "easy|medium|hard", "must_do": true|false, "start_time": "HH:MM", "end_time": "HH:MM", "estimated_minutes": 0, "reason": "..."}]}`;

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    await authenticateRequest(req);
  } catch (err) {
    if (err instanceof AuthError) {
      return new Response(JSON.stringify({ error: err.message }), { status: 401, headers: corsHeaders });
    }
    throw err;
  }

  try {
    const body: RequestBody = await req.json();
    const userPrompt = `[오늘 완료율] ${body.completion_rate}%
[오늘 미완료 항목] ${JSON.stringify(body.incomplete_items)}
[자주 미루는 과목] ${body.most_postponed_subject_label ?? '데이터 부족'}
[오늘 피로도 높음] ${body.fatigue_high}
[내일 빈 시간대] ${JSON.stringify(body.tomorrow_free_gaps)}
[주요 과목] ${body.main_subject_labels.join(', ')}`;

    const raw = await callOpenAIJson(SYSTEM_PROMPT, userPrompt);
    if (!isRecommendationResult(raw)) {
      throw new Error('OpenAI response did not match the expected recommendation shape');
    }

    return new Response(JSON.stringify(raw), { status: 200, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: corsHeaders });
  }
});
