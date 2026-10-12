export type KanaScript = 'hiragana' | 'katakana'
export type KanaGroup = 'basic' | 'voiced' | 'combination'

export interface KanaCharacter {
  id: string
  script: KanaScript
  group: KanaGroup
  row: string
  character: string
  reading: string
  romaji: string
}

export interface KanaChartRow {
  label: string
  hiragana: KanaCharacter
  katakana: KanaCharacter
}

const basicRows: [string, string, string][] = [
  ['あ', 'ア', 'a'], ['い', 'イ', 'i'], ['う', 'ウ', 'u'], ['え', 'エ', 'e'], ['お', 'オ', 'o'],
  ['か', 'カ', 'ka'], ['き', 'キ', 'ki'], ['く', 'ク', 'ku'], ['け', 'ケ', 'ke'], ['こ', 'コ', 'ko'],
  ['さ', 'サ', 'sa'], ['し', 'シ', 'shi'], ['す', 'ス', 'su'], ['せ', 'セ', 'se'], ['そ', 'ソ', 'so'],
  ['た', 'タ', 'ta'], ['ち', 'チ', 'chi'], ['つ', 'ツ', 'tsu'], ['て', 'テ', 'te'], ['と', 'ト', 'to'],
  ['な', 'ナ', 'na'], ['に', 'ニ', 'ni'], ['ぬ', 'ヌ', 'nu'], ['ね', 'ネ', 'ne'], ['の', 'ノ', 'no'],
  ['は', 'ハ', 'ha'], ['ひ', 'ヒ', 'hi'], ['ふ', 'フ', 'fu'], ['へ', 'ヘ', 'he'], ['ほ', 'ホ', 'ho'],
  ['ま', 'マ', 'ma'], ['み', 'ミ', 'mi'], ['む', 'ム', 'mu'], ['め', 'メ', 'me'], ['も', 'モ', 'mo'],
  ['や', 'ヤ', 'ya'], ['ゆ', 'ユ', 'yu'], ['よ', 'ヨ', 'yo'],
  ['ら', 'ラ', 'ra'], ['り', 'リ', 'ri'], ['る', 'ル', 'ru'], ['れ', 'レ', 're'], ['ろ', 'ロ', 'ro'],
  ['わ', 'ワ', 'wa'], ['を', 'ヲ', 'wo'], ['ん', 'ン', 'n'],
]

const voicedRows: [string, string, string, string][] = [
  ['が', 'ガ', 'ga', 'が행'], ['ぎ', 'ギ', 'gi', 'が행'], ['ぐ', 'グ', 'gu', 'が행'], ['げ', 'ゲ', 'ge', 'が행'], ['ご', 'ゴ', 'go', 'が행'],
  ['ざ', 'ザ', 'za', 'ざ행'], ['じ', 'ジ', 'ji', 'ざ행'], ['ず', 'ズ', 'zu', 'ざ행'], ['ぜ', 'ゼ', 'ze', 'ざ행'], ['ぞ', 'ゾ', 'zo', 'ざ행'],
  ['だ', 'ダ', 'da', 'だ행'], ['ぢ', 'ヂ', 'ji', 'だ행'], ['づ', 'ヅ', 'zu', 'だ행'], ['で', 'デ', 'de', 'だ행'], ['ど', 'ド', 'do', 'だ행'],
  ['ば', 'バ', 'ba', 'ば행'], ['び', 'ビ', 'bi', 'ば행'], ['ぶ', 'ブ', 'bu', 'ば행'], ['べ', 'ベ', 'be', 'ば행'], ['ぼ', 'ボ', 'bo', 'ば행'],
  ['ぱ', 'パ', 'pa', 'ぱ행'], ['ぴ', 'ピ', 'pi', 'ぱ행'], ['ぷ', 'プ', 'pu', 'ぱ행'], ['ぺ', 'ペ', 'pe', 'ぱ행'], ['ぽ', 'ポ', 'po', 'ぱ행'],
]

const combinationRows: [string, string, string][] = [
  ['きゃ', 'キャ', 'kya'], ['きゅ', 'キュ', 'kyu'], ['きょ', 'キョ', 'kyo'],
  ['しゃ', 'シャ', 'sha'], ['しゅ', 'シュ', 'shu'], ['しょ', 'ショ', 'sho'],
  ['ちゃ', 'チャ', 'cha'], ['ちゅ', 'チュ', 'chu'], ['ちょ', 'チョ', 'cho'],
  ['にゃ', 'ニャ', 'nya'], ['にゅ', 'ニュ', 'nyu'], ['にょ', 'ニョ', 'nyo'],
  ['ひゃ', 'ヒャ', 'hya'], ['ひゅ', 'ヒュ', 'hyu'], ['ひょ', 'ヒョ', 'hyo'],
  ['みゃ', 'ミャ', 'mya'], ['みゅ', 'ミュ', 'myu'], ['みょ', 'ミョ', 'myo'],
  ['りゃ', 'リャ', 'rya'], ['りゅ', 'リュ', 'ryu'], ['りょ', 'リョ', 'ryo'],
  ['ぎゃ', 'ギャ', 'gya'], ['ぎゅ', 'ギュ', 'gyu'], ['ぎょ', 'ギョ', 'gyo'],
  ['じゃ', 'ジャ', 'ja'], ['じゅ', 'ジュ', 'ju'], ['じょ', 'ジョ', 'jo'],
  ['びゃ', 'ビャ', 'bya'], ['びゅ', 'ビュ', 'byu'], ['びょ', 'ビョ', 'byo'],
  ['ぴゃ', 'ピャ', 'pya'], ['ぴゅ', 'ピュ', 'pyu'], ['ぴょ', 'ピョ', 'pyo'],
]

function createCharacter(script: KanaScript, group: KanaGroup, character: string, romaji: string, row: string, index: number): KanaCharacter {
  return { id: `${script[0]}-${group}-${index}`, script, group, row, character, reading: character, romaji }
}

const hiraganaBasic = basicRows.flatMap(([hiragana, katakana, romaji], index) => hiragana ? [createCharacter('hiragana', 'basic', hiragana, romaji, `${romaji[0]}행`, index)] : [])
const katakanaBasic = basicRows.flatMap(([hiragana, katakana, romaji], index) => katakana ? [createCharacter('katakana', 'basic', katakana, romaji, `${romaji[0]}행`, index)] : [])
const hiraganaVoiced = voicedRows.map(([hiragana, , romaji, row], index) => createCharacter('hiragana', 'voiced', hiragana, romaji, row, index))
const katakanaVoiced = voicedRows.map(([, katakana, romaji, row], index) => createCharacter('katakana', 'voiced', katakana, romaji, row, index))
const hiraganaCombinations = combinationRows.map(([hiragana, , romaji], index) => createCharacter('hiragana', 'combination', hiragana, romaji, '요음', index))
const katakanaCombinations = combinationRows.map(([, katakana, romaji], index) => createCharacter('katakana', 'combination', katakana, romaji, '요음', index))

export const kanaCharacters: KanaCharacter[] = [...hiraganaBasic, ...katakanaBasic, ...hiraganaVoiced, ...katakanaVoiced, ...hiraganaCombinations, ...katakanaCombinations]

export const kanaChartGroups: { title: string; note: string; rows: KanaChartRow[] }[] = [
  { title: '기본음 · 46자', note: 'あ행부터 わ행까지, 일본어 읽기의 뼈대예요.', rows: basicRows.map(([hiragana, katakana, romaji], index) => ({ label: romaji, hiragana: hiraganaBasic.find((item) => item.id === `h-basic-${index}`) ?? createCharacter('hiragana', 'basic', '', romaji, '', index), katakana: katakanaBasic.find((item) => item.id === `k-basic-${index}`) ?? createCharacter('katakana', 'basic', '', romaji, '', index) })) },
  { title: '탁음·반탁음 · 25자', note: '゛는 소리를 울리고, ゜는 p 소리를 만들어요.', rows: voicedRows.map(([hiragana, katakana, romaji, row], index) => ({ label: `${row} ${romaji}`, hiragana: hiraganaVoiced[index], katakana: katakanaVoiced[index] })) },
  { title: '요음 · 33자', note: '작은 ゃ·ゅ·ょ와 합쳐 한 박자로 읽어요.', rows: combinationRows.map(([hiragana, katakana, romaji], index) => ({ label: romaji, hiragana: hiraganaCombinations[index], katakana: katakanaCombinations[index] })) },
]

export const kanaLessonTargets = {
  hiraganaRows: hiraganaBasic.slice(10, 20).concat(hiraganaBasic.slice(20, 22)),
  katakanaRows: katakanaBasic.slice(0, 12),
  voiced: hiraganaVoiced.slice(0, 6).concat(katakanaVoiced.slice(0, 6)),
  combinations: hiraganaCombinations.slice(0, 6).concat(katakanaCombinations.slice(0, 6)),
}

export const kanaLessonQuestionIds = Object.fromEntries(Object.entries(kanaLessonTargets).map(([key, targets]) => [key, targets.flatMap((item) => [`kana-${key}-${item.id}-read`, `kana-${key}-${item.id}-match`])])) as Record<keyof typeof kanaLessonTargets, string[]>
