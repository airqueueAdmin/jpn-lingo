import type { LogParam, NotificationAgreementResult } from '@apps-in-toss/web-framework'

type AnalyticsParams = Record<string, LogParam>

let sdkPromise: Promise<typeof import('@apps-in-toss/web-framework')> | null = null

function getSdk() {
  sdkPromise ??= import('@apps-in-toss/web-framework')
  return sdkPromise
}

async function log(type: 'event' | 'screen' | 'click' | 'impression', name: string, params: AnalyticsParams = {}) {
  try {
    const { Analytics } = await getSdk()
    await Analytics.log({ log_name: name, log_type: type, params })
  } catch (error) {
    // The browser preview and older Toss app versions can omit the bridge.
    // Analytics must never interrupt a learning action.
    console.debug('Apps in Toss analytics unavailable.', error)
  }
}

export function logAppEvent(name: string, params: AnalyticsParams = {}) {
  void log('event', name, params)
}

export function logScreen(name: string, params: AnalyticsParams = {}) {
  void log('screen', name, params)
}

export function logClick(name: string, params: AnalyticsParams = {}) {
  void log('click', name, params)
}

export function logImpression(name: string, params: AnalyticsParams = {}) {
  void log('impression', name, params)
}

export function subscribeNativeBack(onBack: () => void) {
  let cancelled = false
  let unsubscribe: (() => void) | undefined
  void getSdk().then(({ graniteEvent }) => {
    if (cancelled) return
    unsubscribe = graniteEvent.addEventListener('backEvent', {
      onEvent: onBack,
      onError: (error) => console.debug('Apps in Toss back event unavailable.', error),
    })
  }).catch((error) => console.debug('Apps in Toss back event unavailable.', error))
  return () => {
    cancelled = true
    unsubscribe?.()
  }
}

export type NotificationRequestResult = NotificationAgreementResult | 'unconfigured' | 'unsupported' | 'error'

const notificationTemplateCode = import.meta.env.VITE_TOSS_NOTIFICATION_TEMPLATE_CODE as string | undefined

export function isNotificationAgreementConfigured() {
  return Boolean(notificationTemplateCode?.trim())
}

export async function requestStudyNotificationAgreement(): Promise<NotificationRequestResult> {
  const templateCode = notificationTemplateCode?.trim()
  if (!templateCode) return 'unconfigured'

  try {
    const { Notification } = await getSdk()
    if (!Notification.requestAgreement.isSupported()) return 'unsupported'

    return await new Promise<NotificationRequestResult>((resolve) => {
      let cleanup: (() => void) | undefined
      let shouldCleanup = false
      const finish = (result: NotificationRequestResult) => {
        if (cleanup) cleanup()
        else shouldCleanup = true
        resolve(result)
      }

      try {
        cleanup = Notification.requestAgreement({
          options: { templateCode },
          onEvent: ({ type }) => finish(type),
          onError: (error) => {
            console.warn('학습 알림 동의 요청 실패', error)
            finish('error')
          },
        })
        if (shouldCleanup) cleanup()
      } catch (error) {
        console.warn('학습 알림 동의 API를 호출할 수 없습니다.', error)
        finish('error')
      }
    })
  } catch (error) {
    console.debug('Apps in Toss notification bridge unavailable.', error)
    return 'error'
  }
}
