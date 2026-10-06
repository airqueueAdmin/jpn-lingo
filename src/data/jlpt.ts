export type JlptLevel = 'N5' | 'N4' | 'N3' | 'N2' | 'N1'

export interface JlptTestSection {
  name: string
  time: string
}

export interface JlptScoringSection {
  name: string
  range: string
  passMark: string
}

export interface JlptExamInfo {
  level: JlptLevel
  summary: string
  testSections: JlptTestSection[]
  scoringSections: JlptScoringSection[]
  totalRange: string
  overallPassMark: string
  studyFocus: string[]
  note: string
}

export const jlptLevels: JlptLevel[] = ['N5', 'N4', 'N3', 'N2', 'N1']

export const jlptExamInfo: Record<JlptLevel, JlptExamInfo> = {
  N5: {
    level: 'N5',
    summary: '히라가나·가타카나와 기본적인 일본어를 어느 정도 이해하는 단계예요.',
    testSections: [{ name: '언어지식(문자·어휘)', time: '20분' }, { name: '언어지식(문법)·독해', time: '40분' }, { name: '청해', time: '30분' }],
    scoringSections: [{ name: '언어지식(문자·어휘·문법)·독해', range: '0~120점', passMark: '38점 이상' }, { name: '청해', range: '0~60점', passMark: '19점 이상' }],
    totalRange: '0~180점', overallPassMark: '80점 이상',
    studyFocus: ['히라가나·가타카나', '기초 어휘·한자', '기본 문법', '짧은 독해·청해'],
    note: '시험 과목은 3개지만 언어지식과 독해는 하나의 채점 구분으로 합산돼요.',
  },
  N4: {
    level: 'N4',
    summary: '기본적인 일본어를 이해하고, 익숙한 일상 장면의 내용을 파악하는 단계예요.',
    testSections: [{ name: '언어지식(문자·어휘)', time: '25분' }, { name: '언어지식(문법)·독해', time: '55분' }, { name: '청해', time: '35분' }],
    scoringSections: [{ name: '언어지식(문자·어휘·문법)·독해', range: '0~120점', passMark: '38점 이상' }, { name: '청해', range: '0~60점', passMark: '19점 이상' }],
    totalRange: '0~180점', overallPassMark: '90점 이상',
    studyFocus: ['기초 어휘·한자', '기본 활용과 조사', '일상 독해', '느린 회화 청해'],
    note: '시험 과목은 3개지만 언어지식과 독해는 하나의 채점 구분으로 합산돼요.',
  },
  N3: {
    level: 'N3',
    summary: '일상적인 상황의 일본어를 어느 정도 이해하는 N4와 N2의 연결 단계예요.',
    testSections: [{ name: '언어지식(문자·어휘)', time: '30분' }, { name: '언어지식(문법)·독해', time: '70분' }, { name: '청해', time: '40분' }],
    scoringSections: [{ name: '언어지식(어휘·문법)', range: '0~60점', passMark: '19점 이상' }, { name: '독해', range: '0~60점', passMark: '19점 이상' }, { name: '청해', range: '0~60점', passMark: '19점 이상' }],
    totalRange: '0~180점', overallPassMark: '95점 이상',
    studyFocus: ['중급 어휘·한자', '문법 연결 표현', '중간 길이 독해', '자연스러운 속도의 청해'],
    note: '시험 과목과 채점 구분이 달라요. 어휘와 문법은 합산되고, 독해는 별도 채점돼요.',
  },
  N2: {
    level: 'N2',
    summary: '일상생활과 다양한 상황에서 사용되는 일본어를 이해하는 것을 목표로 해요.',
    testSections: [{ name: '언어지식(어휘·문법)·독해', time: '105분' }, { name: '청해', time: '50분' }],
    scoringSections: [{ name: '언어지식(어휘·문법)', range: '0~60점', passMark: '19점 이상' }, { name: '독해', range: '0~60점', passMark: '19점 이상' }, { name: '청해', range: '0~60점', passMark: '19점 이상' }],
    totalRange: '0~180점', overallPassMark: '90점 이상',
    studyFocus: ['N2 어휘·한자', '유사 문법 비교', '중장문 독해', '핵심 정보 청해'],
    note: '언어지식, 독해, 청해가 각각 별도 채점돼요. 한 영역이라도 기준점 미만이면 총점과 관계없이 불합격이에요.',
  },
  N1: {
    level: 'N1',
    summary: '다양한 상황에서 사용되는 일본어를 이해하는 가장 높은 단계예요.',
    testSections: [{ name: '언어지식(어휘·문법)·독해', time: '110분' }, { name: '청해', time: '55분' }],
    scoringSections: [{ name: '언어지식(어휘·문법)', range: '0~60점', passMark: '19점 이상' }, { name: '독해', range: '0~60점', passMark: '19점 이상' }, { name: '청해', range: '0~60점', passMark: '19점 이상' }],
    totalRange: '0~180점', overallPassMark: '100점 이상',
    studyFocus: ['고급 어휘·한자', '추상적인 문법', '논설·정보 독해', '자연스러운 청해'],
    note: '언어지식, 독해, 청해가 각각 별도 채점돼요. 모든 채점 구분에서 기준점을 넘어야 해요.',
  },
}

export const jlptOfficialLinks = {
  official: 'https://www.jlpt.jp/e/',
  levels: 'https://www.jlpt.jp/e/about/levelsummary.html',
  sections: 'https://www.jlpt.jp/e/guideline/testsections.html',
  results: 'https://www.jlpt.jp/e/guideline/results.html',
  korea: 'https://www.jlpt.or.kr/html/',
  koreaBusan: 'https://www.bsjlpt.or.kr/',
}
