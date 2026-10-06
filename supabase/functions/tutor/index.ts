const allowedOrigins = new Set([
  'https://japanese-lingo.apps.tossmini.com',
  'https://japanese-lingo.private-apps.tossmini.com',
  'https://glance-invest.apps.tossmini.com',
  'https://glance-invest.private-apps.tossmini.com',
  'http://localhost:5173',
  'http://localhost:4173',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:4173',
])

function corsHeaders(origin: string | null) {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
  if (origin && allowedOrigins.has(origin)) headers['Access-Control-Allow-Origin'] = origin
  return headers
}

type TutorResponse = { answer: string; examples: string[]; quiz?: { prompt: string; options: string[]; answer: string } }

function json(body: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } })
}

function parseJson(text: string): TutorResponse | null {
  const cleaned = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim()
  try {
    const value = JSON.parse(cleaned) as Partial<TutorResponse>
    if (typeof value.answer !== 'string' || !Array.isArray(value.examples)) return null
    return { answer: value.answer, examples: value.examples.filter((item): item is string => typeof item === 'string').slice(0, 4), quiz: value.quiz && typeof value.quiz.prompt === 'string' && Array.isArray(value.quiz.options) && typeof value.quiz.answer === 'string' ? { prompt: value.quiz.prompt, options: value.quiz.options.filter((item): item is string => typeof item === 'string').slice(0, 4), answer: value.quiz.answer } : undefined }
  } catch {
    return null
  }
}

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin')
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) })
  if (request.method !== 'POST') return json({ error: 'POST 요청만 허용됩니다.' }, 405, origin)
  if (!request.headers.get('Authorization')) return json({ error: '로그인이 필요합니다.' }, 401, origin)

  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) return json({ error: 'GEMINI_API_KEY가 Edge Function Secret에 없습니다.' }, 500, origin)

  const body = await request.json().catch(() => null) as { question?: unknown; level?: unknown; context?: unknown } | null
  if (!body || typeof body.question !== 'string' || body.question.trim().length === 0) return json({ error: '질문을 입력해주세요.' }, 400, origin)

  const model = Deno.env.get('GEMINI_MODEL') || 'gemini-3.1-flash-lite'
  const prompt = `학습자 레벨: ${typeof body.level === 'string' ? body.level : '초급'}\n추가 맥락: ${typeof body.context === 'string' ? body.context : '없음'}\n학습자 질문: ${body.question.trim().slice(0, 500)}`
  const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      system_instruction: { parts: [{ text: '너는 한국인 일본어 학습자를 돕는 튜터다. 쉬운 한국어로 설명하고, 일본어 예문과 한국어 해석을 제공한다. 질문이 문법 비교라면 차이를 명확히 비교한다. 반드시 JSON만 반환한다. 형식: {"answer":"설명","examples":["일본어 예문\\n한국어 해석"],"quiz":{"prompt":"미니 퀴즈","options":["선택지"],"answer":"정답"}}. 퀴즈가 필요 없으면 quiz는 null이다.' }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.35, maxOutputTokens: 700, responseMimeType: 'application/json' },
    }),
  })
  if (!geminiResponse.ok) return json({ error: 'Gemini 응답을 가져오지 못했습니다.' }, 502, origin)
  const payload = await geminiResponse.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? ''
  const tutorResponse = parseJson(text)
  if (!tutorResponse) return json({ error: '튜터 응답 형식이 올바르지 않습니다.' }, 502, origin)
  return json(tutorResponse, 200, origin)
})
