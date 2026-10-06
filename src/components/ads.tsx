import { useCallback, useEffect, useRef, useState } from 'react'

type FullScreenAdType = 'interstitial' | 'rewarded'
type Reward = { unitType: string; unitAmount: number }
type AdsModule = typeof import('@apps-in-toss/web-framework')

const adGroupIds: Record<FullScreenAdType, string | undefined> = {
  interstitial: import.meta.env.VITE_TOSS_AD_INTERSTITIAL_GROUP_ID as string | undefined,
  rewarded: import.meta.env.VITE_TOSS_AD_REWARDED_GROUP_ID as string | undefined,
}
const bannerAdGroupId = import.meta.env.VITE_TOSS_AD_BANNER_GROUP_ID as string | undefined
let adsModulePromise: Promise<AdsModule> | null = null
let bannerInitialization: Promise<boolean> | null = null

function getAdsModule() {
  adsModulePromise ??= import('@apps-in-toss/web-framework')
  return adsModulePromise
}

function configured(value: string | undefined): value is string {
  return Boolean(value?.trim())
}

export function useFullscreenAd(type: FullScreenAdType) {
  const adGroupId = adGroupIds[type]
  const [isLoaded, setIsLoaded] = useState(false)
  const [isSupported, setIsSupported] = useState(false)
  const mountedRef = useRef(true)

  const preload = useCallback(async () => {
    if (!configured(adGroupId)) return undefined
    try {
      const { loadFullScreenAd } = await getAdsModule()
      if (!loadFullScreenAd.isSupported()) return undefined
      if (mountedRef.current) setIsSupported(true)
      return loadFullScreenAd({
        options: { adGroupId },
        onEvent: (event) => {
          if (event.type === 'loaded' && mountedRef.current) setIsLoaded(true)
        },
        onError: (error) => {
          console.warn(`${type} 광고 로드 실패`, error)
          if (mountedRef.current) setIsLoaded(false)
        },
      })
    } catch (error) {
      console.warn(`${type} 광고 SDK를 사용할 수 없습니다.`, error)
      return undefined
    }
  }, [adGroupId, type])

  useEffect(() => {
    mountedRef.current = true
    let unregister: (() => void) | undefined
    void preload().then((cleanup) => {
      if (!mountedRef.current) cleanup?.()
      else unregister = cleanup
    })
    return () => {
      mountedRef.current = false
      unregister?.()
    }
  }, [preload])

  const show = useCallback(async (onReward?: (reward: Reward) => void) => {
    if (!configured(adGroupId) || !isLoaded) return false
    try {
      const { showFullScreenAd } = await getAdsModule()
      if (!showFullScreenAd.isSupported()) return false
      setIsLoaded(false)
      return await new Promise<boolean>((resolve) => {
        let settled = false
        const settle = (shown: boolean) => {
          if (settled) return
          settled = true
          resolve(shown)
          if (shown) void preload()
        }
        showFullScreenAd({
          options: { adGroupId },
          onEvent: (event) => {
            if (event.type === 'userEarnedReward') onReward?.(event.data)
            if (event.type === 'dismissed') settle(true)
            if (event.type === 'failedToShow') settle(false)
          },
          onError: (error) => {
            console.warn(`${type} 광고 표시 실패`, error)
            settle(false)
          },
        })
      })
    } catch (error) {
      console.warn(`${type} 광고 SDK를 사용할 수 없습니다.`, error)
      return false
    }
  }, [adGroupId, isLoaded, preload, type])

  return { configured: configured(adGroupId), isLoaded, isSupported, show }
}

async function initializeBannerAds() {
  if (!configured(bannerAdGroupId)) return false
  if (!bannerInitialization) {
    bannerInitialization = getAdsModule().then(({ TossAds }) => new Promise<boolean>((resolve) => {
      if (!TossAds.initialize.isSupported()) {
        resolve(false)
        return
      }
      TossAds.initialize({
        callbacks: {
          onInitialized: () => resolve(true),
          onInitializationFailed: (error) => {
            console.warn('배너 광고 SDK 초기화 실패', error)
            resolve(false)
          },
        },
      })
    })).catch((error) => {
      console.warn('배너 광고 SDK를 사용할 수 없습니다.', error)
      return false
    })
  }
  return bannerInitialization
}

export function BannerAd() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!configured(bannerAdGroupId) || !containerRef.current) return
    let cancelled = false
    let destroy: (() => void) | undefined
    void initializeBannerAds().then(async (initialized) => {
      if (!initialized || cancelled || !containerRef.current) return
      try {
        const { TossAds } = await getAdsModule()
        if (!TossAds.attachBanner.isSupported() || cancelled || !containerRef.current) return
        const attached = TossAds.attachBanner(bannerAdGroupId, containerRef.current, {
          theme: 'auto',
          tone: 'blackAndWhite',
          variant: 'expanded',
          callbacks: {
            onAdRendered: () => setReady(true),
            onNoFill: () => setReady(false),
            onAdFailedToRender: () => setReady(false),
          },
        })
        destroy = attached.destroy
      } catch (error) {
        console.warn('배너 광고 부착 실패', error)
      }
    })
    return () => {
      cancelled = true
      destroy?.()
    }
  }, [])

  if (!configured(bannerAdGroupId)) return null
  return <section className="banner-ad" aria-label="광고 영역"><div className="ad-disclosure"><span>AD</span><p>이 영역에는 학습 콘텐츠와 별도의 광고가 표시돼요.</p></div><div className={ready ? 'ad-slot banner-ad-slot ready' : 'ad-slot banner-ad-slot'} ref={containerRef} aria-label="광고" /></section>
}

export function RewardedAdCard() {
  const rewarded = useFullscreenAd('rewarded')
  const [message, setMessage] = useState('')
  if (!rewarded.configured) return null
  const handleShow = async () => {
    setMessage('')
    const shown = await rewarded.show((reward) => {
      window.dispatchEvent(new CustomEvent('japanese-lingo:ad-reward', { detail: reward }))
      setMessage('광고 시청 완료! +10 XP 집중 보너스를 받았어요.')
    })
    if (!shown) setMessage('광고를 준비하지 못했어요. 잠시 후 다시 시도해주세요.')
  }
  return <section className="reward-ad-card"><div><span className="ad-label">AD · REWARDED</span><h3>집중 보너스 받기</h3><p>버튼을 누르면 광고가 먼저 재생돼요. 끝까지 시청하면 추가 학습 보너스를 받을 수 있어요.</p></div><button className="secondary-button" disabled={!rewarded.isLoaded} onClick={() => { void handleShow() }}>{rewarded.isLoaded ? '광고 보기' : '준비 중'}</button>{message && <small className="reward-ad-message">{message}</small>}</section>
}
