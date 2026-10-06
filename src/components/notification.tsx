import { useEffect, useState } from 'react'
import { isNotificationAgreementConfigured, logClick, logImpression, logAppEvent, requestStudyNotificationAgreement, type NotificationRequestResult } from '../services/toss'

const PROMPT_STORAGE_KEY = 'japanese-lingo:notification-prompt-v1'
type PromptState = 'idle' | 'dismissed' | 'accepted'

function getPromptState(): PromptState {
  const value = window.localStorage.getItem(PROMPT_STORAGE_KEY)
  return value === 'dismissed' || value === 'accepted' ? value : 'idle'
}

function setPromptState(value: Exclude<PromptState, 'idle'>) {
  window.localStorage.setItem(PROMPT_STORAGE_KEY, value)
}

function resultMessage(result: NotificationRequestResult) {
  if (result === 'newAgreement' || result === 'alreadyAgreed') return '학습 알림을 켰어요. 다음 학습을 이어갈 수 있게 알려드릴게요.'
  if (result === 'agreementRejected') return '알림을 켜지 않았어요. 토스 앱 설정에서 언제든 바꿀 수 있어요.'
  if (result === 'unsupported') return '현재 토스 앱 버전에서는 학습 알림을 사용할 수 없어요.'
  return '알림 설정을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.'
}

export function NotificationConsentCard({ completedLessons }: { completedLessons: number }) {
  const [promptState, setPromptStateValue] = useState<PromptState>(() => getPromptState())
  const [requesting, setRequesting] = useState(false)
  const [message, setMessage] = useState('')
  const eligible = completedLessons > 0 && isNotificationAgreementConfigured()

  useEffect(() => {
    if (eligible && promptState === 'idle') logImpression('study_notification_prompt', { placement: 'home_after_first_lesson' })
  }, [eligible, promptState])

  if (!eligible || promptState !== 'idle') return null

  const handleRequest = async () => {
    if (requesting) return
    setRequesting(true)
    logClick('study_notification_agreement', { placement: 'home_after_first_lesson' })
    const result = await requestStudyNotificationAgreement()
    logAppEvent('study_notification_agreement_result', { result })
    setRequesting(false)
    setMessage(resultMessage(result))
    if (result === 'newAgreement' || result === 'alreadyAgreed') {
      setPromptState('accepted')
      setPromptStateValue('accepted')
    } else if (result === 'agreementRejected') {
      setPromptState('dismissed')
      setPromptStateValue('dismissed')
    }
  }

  const handleLater = () => {
    logClick('study_notification_dismiss', { placement: 'home_after_first_lesson' })
    setPromptState('dismissed')
    setPromptStateValue('dismissed')
  }

  return <section className="notification-card"><div className="notification-card-icon">◷</div><div className="notification-card-copy"><p className="eyebrow">학습 알림</p><h3>다음 학습을 잊지 않게 알려드릴까요?</h3><p>첫 레슨을 끝냈어요. 매일 공부할 시간에 학습 알림을 받을 수 있어요.</p><div className="notification-card-actions"><button className="secondary-button" disabled={requesting} onClick={() => { void handleRequest() }}>{requesting ? '설정 중…' : '알림 켜기'}</button><button className="text-button" onClick={handleLater}>나중에</button></div>{message && <small className="notification-card-message">{message}</small>}</div></section>
}
