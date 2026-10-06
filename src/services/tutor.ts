import type { Grammar } from '../types'
import { supabase } from '../lib/supabase'

export interface TutorRequest { question: string; level: string; context?: string }
export interface TutorResponse { answer: string; examples: string[]; quiz?: { prompt: string; options: string[]; answer: string } }

const fallbackAnswer: TutorResponse = {
  answer: 'わけではない는 “반드시 ~인 것은 아니다”라는 부분 부정이에요. 전부 틀렸다고 말하는 것이 아니라, 예외가 있을 수 있다는 여지를 남깁니다. 반면 わけがない는 “~일 리가 없다”라는 강한 부정이에요.',
  examples: ['高いものがいつもいいわけではない。\n비싼 것이 항상 좋은 것은 아니다.', 'そんなことがあるわけがない。\n그런 일이 있을 리가 없다.'],
  quiz: { prompt: '“그렇다고 해서 쉽다는 뜻은 아니다”에 가까운 표현은?', options: ['というわけではない', 'わけがない', 'ながら'], answer: 'というわけではない' },
}

export async function askTutor(request: TutorRequest, grammar?: Grammar): Promise<TutorResponse> {
  const endpoint = import.meta.env.VITE_TUTOR_API_URL as string | undefined
  if (!endpoint && supabase) {
    const { data, error } = await supabase.functions.invoke<TutorResponse>('tutor', { body: request })
    if (!error && data) return data
    if (error) throw error
  }
  if (!endpoint) {
    await new Promise((resolve) => window.setTimeout(resolve, 350))
    if (grammar?.title === '〜ながら') return { answer: '〜ながら는 한 사람이 두 동작을 동시에 할 때 사용해요. 뒤에 오는 동작이 주된 행동입니다.', examples: ['音楽を聞きながら勉強します。\n음악을 들으면서 공부합니다.'], quiz: { prompt: '“책을 읽으면서 차를 마십니다”에 알맞은 것은?', options: ['本を読みながらお茶を飲みます。', '本を読むわけがありません。', '本を読んでください。'], answer: '本を読みながらお茶を飲みます。' } }
    return fallbackAnswer
  }

  const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) })
  if (!response.ok) throw new Error('튜터 응답을 가져오지 못했어요.')
  return response.json() as Promise<TutorResponse>
}
