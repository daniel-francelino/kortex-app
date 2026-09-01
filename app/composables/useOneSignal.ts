import { Capacitor } from '@capacitor/core'
import { createSharedComposable } from '@vueuse/core'
import { detectBrowserTimeZone } from '#shared/utils/dateTime'
import type { AuthUser } from '~/composables/useAuth'
import type {
  NotificationAppContext,
  NotificationPermission,
  NotificationPlatform,
  NotificationPushChannel,
  NotificationSubscriptionSyncPayload
} from '~/types/notifications'
import { extractNotificationId, extractNotificationTarget } from '~/utils/notification-target'

type OneSignalWebPushSubscription = {
  id?: string | null
  token?: string | null
  optedIn?: boolean
  optIn?: () => void | Promise<void>
  optOut?: () => void | Promise<void>
  addEventListener?: (event: 'change', listener: () => void | Promise<void>) => void
}

type OneSignalWebUser = {
  onesignalId?: string | null
  PushSubscription?: OneSignalWebPushSubscription
}

type OneSignalWebNotifications = {
  // OneSignal Web SDK v16 exposes this as a boolean ("is push allowed"), not
  // the granular Notification.permission string — never use it as a
  // NotificationPermission value (see refreshWebState below).
  permission?: boolean
  requestPermission?: () => Promise<void>
  addEventListener?: (
    event: 'click' | 'permissionChange',
    listener: (event: unknown) => void | Promise<void>
  ) => void
}

type OneSignalWebSDK = {
  init: (options: Record<string, unknown>) => Promise<void>
  login?: (externalId: string) => void | Promise<void>
  logout?: () => void | Promise<void>
  User?: OneSignalWebUser
  Notifications?: OneSignalWebNotifications
  Slidedown?: {
    promptPush?: () => Promise<void>
  }
}

type OneSignalNativeNotification = {
  display: () => void
}

type OneSignalNativeForegroundEvent = {
  getNotification: () => OneSignalNativeNotification
}

type OneSignalNativeClickEvent = {
  result?: {
    url?: string
  }
  notification?: {
    launchURL?: string
    additionalData?: Record<string, unknown>
  }
}

type OneSignalNativeSDK = {
  initialize: (appId: string) => void
  login: (externalId: string) => void
  logout: () => void
  Notifications: {
    addEventListener: (
      event: 'click' | 'foregroundWillDisplay' | 'permissionChange',
      listener: ((event: OneSignalNativeClickEvent | OneSignalNativeForegroundEvent | boolean) => void | Promise<void>)
    ) => void
    getPermissionAsync: () => Promise<boolean>
    permissionNative: () => Promise<number>
    requestPermission: (fallbackToSettings?: boolean) => Promise<boolean>
  }
  User: {
    pushSubscription: {
      addEventListener: (event: 'change', listener: () => void | Promise<void>) => void
      getIdAsync: () => Promise<string | null>
      getTokenAsync: () => Promise<string | null>
      getOptedInAsync: () => Promise<boolean>
      optIn: () => void
      optOut: () => void
    }
  }
}

type OneSignalState = {
  initialized: boolean
  supported: boolean
  permission: NotificationPermission
  optedIn: boolean
  subscriptionId: string | null
  token: string | null
  oneSignalUserId: string | null
  channel: NotificationPushChannel | null
  platform: NotificationPlatform | null
  appContext: NotificationAppContext
  deviceKey: string | null
  lastSyncedAt: number | null
}

declare global {
  interface Window {
    OneSignal?: OneSignalWebSDK
    OneSignalDeferred?: Array<(sdk: OneSignalWebSDK) => void | Promise<void>>
  }
}

const ONE_SIGNAL_WEB_SDK_URL = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js'
const ONE_SIGNAL_WEB_SDK_VERSION = 'web-v16'
const ONE_SIGNAL_NATIVE_SDK_VERSION = 'onesignal-cordova-plugin@5.3.4'
const ONE_SIGNAL_DEVICE_KEY_STORAGE = 'onesignal-device-key'

let webSdkPromise: Promise<OneSignalWebSDK | null> | null = null
let nativeSdkPromise: Promise<OneSignalNativeSDK | null> | null = null
let webSdkInitialized = false
let webListenersBound = false
let nativeListenersBound = false
let authWatcherBound = false

function createDeviceKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    return crypto.randomUUID()

  return `onesignal-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function getCurrentPlatform(): NotificationPlatform {
  const platform = Capacitor.getPlatform()
  return platform === 'ios' || platform === 'android' ? platform : 'web'
}

function getCurrentAppContext(): NotificationAppContext {
  if (!import.meta.client)
    return 'browser'

  if (Capacitor.isNativePlatform())
    return 'native'

  const isStandalone = window.matchMedia?.('(display-mode: standalone)')?.matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone)

  return isStandalone ? 'pwa' : 'browser'
}

function getNativePermissionState(permissionNative: number, hasPermission: boolean): NotificationPermission {
  if (permissionNative === 1)
    return 'denied'

  if (permissionNative === 2 || permissionNative === 3 || permissionNative === 4 || hasPermission)
    return 'granted'

  return 'default'
}

async function maybeAwait<T>(value: Promise<T> | T) {
  return await Promise.resolve(value)
}

async function loadNativeSdk(): Promise<OneSignalNativeSDK | null> {
  if (!import.meta.client || !Capacitor.isNativePlatform())
    return null

  if (nativeSdkPromise)
    return nativeSdkPromise

  nativeSdkPromise = import('onesignal-cordova-plugin')
    .then(module => module.default as unknown as OneSignalNativeSDK)
    .catch(() => null)

  return nativeSdkPromise
}

async function loadWebSdk(runtimeConfig: ReturnType<typeof useRuntimeConfig>): Promise<OneSignalWebSDK | null> {
  if (!import.meta.client || Capacitor.isNativePlatform())
    return null

  if (!('Notification' in window) || !('serviceWorker' in navigator))
    return null

  if (window.OneSignal && webSdkInitialized)
    return window.OneSignal

  if (webSdkPromise)
    return webSdkPromise

  webSdkPromise = new Promise<OneSignalWebSDK | null>((resolve, reject) => {
    const initSdk = async (sdk: OneSignalWebSDK) => {
      await sdk.init({
        appId: runtimeConfig.public.oneSignalAppId,
        allowLocalhostAsSecureOrigin: false,
        notifyButton: { enable: false },
        serviceWorkerPath: runtimeConfig.public.oneSignalServiceWorkerPath,
        serviceWorkerUpdaterPath: runtimeConfig.public.oneSignalServiceWorkerUpdaterPath,
        serviceWorkerParam: {
          scope: runtimeConfig.public.oneSignalServiceWorkerScope
        }
      })

      window.OneSignal = sdk
      webSdkInitialized = true
      resolve(sdk)
    }

    if (window.OneSignal) {
      void initSdk(window.OneSignal).catch(reject)
      return
    }

    window.OneSignalDeferred = window.OneSignalDeferred || []
    window.OneSignalDeferred.push((sdk) => {
      void initSdk(sdk).catch(reject)
    })

    const existingScript = document.querySelector<HTMLScriptElement>('script[data-onesignal-web-sdk="true"]')
    if (existingScript)
      return

    const script = document.createElement('script')
    script.async = true
    script.defer = true
    script.src = ONE_SIGNAL_WEB_SDK_URL
    script.dataset.onesignalWebSdk = 'true'
    script.onerror = () => reject(new Error('Failed to load OneSignal Web SDK'))
    document.head.appendChild(script)
  })

  return webSdkPromise
}

const _useOneSignal = () => {
  const runtimeConfig = useRuntimeConfig()
  const requestFetch = useRequestFetch()
  const router = useRouter()
  const route = useRoute()
  const { user } = useAuth()
  const notifications = useNotifications()

  const state = useState<OneSignalState>('onesignal', () => ({
    initialized: false,
    supported: false,
    permission: 'default',
    optedIn: false,
    subscriptionId: null,
    token: null,
    oneSignalUserId: null,
    channel: null,
    platform: null,
    appContext: getCurrentAppContext(),
    deviceKey: null,
    lastSyncedAt: null
  }))
  const identifiedUserId = useState<string | null>('onesignal:identified-user-id', () => null)
  const initStarted = useState<boolean>('onesignal:init-started', () => false)

  const isEnabled = computed(() => {
    if (!import.meta.client)
      return false

    return !import.meta.dev
      && runtimeConfig.public.oneSignalEnabled
      && Boolean(runtimeConfig.public.oneSignalAppId)
  })

  const isNative = computed(() => import.meta.client && Capacitor.isNativePlatform())
  const currentChannel = computed<NotificationPushChannel>(() => isNative.value ? 'mobile_push' : 'web_push')
  const isSubscribed = computed(() => state.value.permission === 'granted' && state.value.optedIn)

  function ensureDeviceKey() {
    if (!import.meta.client)
      return null

    if (state.value.deviceKey)
      return state.value.deviceKey

    const existingDeviceKey = window.localStorage.getItem(ONE_SIGNAL_DEVICE_KEY_STORAGE)
    const deviceKey = existingDeviceKey || createDeviceKey()

    if (!existingDeviceKey)
      window.localStorage.setItem(ONE_SIGNAL_DEVICE_KEY_STORAGE, deviceKey)

    state.value.deviceKey = deviceKey
    return deviceKey
  }

  async function refreshWebState() {
    const sdk = await loadWebSdk(runtimeConfig)
    state.value.appContext = getCurrentAppContext()
    state.value.channel = 'web_push'
    state.value.platform = 'web'

    if (!sdk) {
      state.value.supported = false
      state.value.permission = 'unsupported'
      state.value.optedIn = false
      state.value.subscriptionId = null
      state.value.token = null
      state.value.oneSignalUserId = null
      return
    }

    // Notification.permission (the real browser API) is the only reliable
    // source for the granular 'default'|'granted'|'denied' string here —
    // sdk.Notifications?.permission is a boolean, not this string union (see
    // the OneSignalWebNotifications type above). loadWebSdk already checked
    // `'Notification' in window` before resolving a non-null sdk, so this is
    // safe to read directly at this point.
    const permission = Notification.permission as NotificationPermission
    const pushSubscription = sdk.User?.PushSubscription

    state.value.supported = true
    state.value.permission = permission
    state.value.subscriptionId = pushSubscription?.id ?? null
    state.value.token = pushSubscription?.token ?? null
    state.value.optedIn = Boolean(pushSubscription?.optedIn)
    state.value.oneSignalUserId = sdk.User?.onesignalId ?? null
  }

  async function refreshNativeState() {
    const sdk = await loadNativeSdk()
    state.value.appContext = 'native'
    state.value.channel = 'mobile_push'
    state.value.platform = getCurrentPlatform()

    if (!sdk) {
      state.value.supported = false
      state.value.permission = 'unsupported'
      state.value.optedIn = false
      state.value.subscriptionId = null
      state.value.token = null
      state.value.oneSignalUserId = null
      return
    }

    const [hasPermission, permissionNative, subscriptionId, token, optedIn] = await Promise.all([
      sdk.Notifications.getPermissionAsync(),
      sdk.Notifications.permissionNative(),
      sdk.User.pushSubscription.getIdAsync(),
      sdk.User.pushSubscription.getTokenAsync(),
      sdk.User.pushSubscription.getOptedInAsync()
    ])

    state.value.supported = true
    state.value.permission = getNativePermissionState(permissionNative, hasPermission)
    state.value.subscriptionId = subscriptionId
    state.value.token = token
    state.value.optedIn = optedIn
    state.value.oneSignalUserId = null
  }

  async function refreshState() {
    state.value.appContext = getCurrentAppContext()

    if (!isEnabled.value) {
      state.value.supported = false
      state.value.permission = 'unsupported'
      return
    }

    if (isNative.value) {
      await refreshNativeState()
      return
    }

    await refreshWebState()
  }

  async function syncCurrentDevice() {
    if (!isEnabled.value || !state.value.initialized || !user.value)
      return

    const deviceKey = ensureDeviceKey()
    if (!deviceKey)
      return

    const payload: NotificationSubscriptionSyncPayload = {
      provider: 'onesignal',
      deviceKey,
      channel: currentChannel.value,
      platform: getCurrentPlatform(),
      appContext: getCurrentAppContext(),
      oneSignalSubscriptionId: state.value.subscriptionId,
      oneSignalUserId: state.value.oneSignalUserId,
      token: state.value.token,
      permission: state.value.permission,
      optedIn: state.value.optedIn,
      sdkVersion: isNative.value ? ONE_SIGNAL_NATIVE_SDK_VERSION : ONE_SIGNAL_WEB_SDK_VERSION,
      appVersion: null,
      deviceModel: import.meta.client ? navigator.userAgent : null,
      language: import.meta.client ? navigator.language : null,
      timezone: detectBrowserTimeZone() ?? null,
      metadata: {
        currentPath: route.fullPath
      }
    }

    try {
      await requestFetch('/api/settings/notifications/subscription', {
        method: 'PUT',
        body: payload,
        credentials: 'include'
      })

      state.value.lastSyncedAt = Date.now()
    } catch (err) {
      // Best-effort background sync — surfacing this as a toast on every
      // permission/subscription change would be noisy, but it still needs to
      // be visible somewhere instead of becoming an unhandled rejection.
      console.error('[useOneSignal] failed to sync device subscription', err)
    }
  }

  async function handleNotificationClick(event: unknown) {
    const notificationId = extractNotificationId(event)
    if (notificationId) {
      try {
        await notifications.markRead(notificationId)
      } catch {
        // Ignore notification inbox sync failures when handling a push click.
      }
    }

    const target = extractNotificationTarget(event, runtimeConfig.public.siteUrl)
    if (!target)
      return

    await router.push(target)
  }

  async function bindWebListeners(sdk: OneSignalWebSDK) {
    if (webListenersBound)
      return

    sdk.Notifications?.addEventListener?.('click', (event) => {
      void handleNotificationClick(event)
    })
    sdk.Notifications?.addEventListener?.('permissionChange', () => {
      void refreshWebState().then(syncCurrentDevice)
    })
    sdk.User?.PushSubscription?.addEventListener?.('change', () => {
      void refreshWebState().then(syncCurrentDevice)
    })

    webListenersBound = true
  }

  async function bindNativeListeners(sdk: OneSignalNativeSDK) {
    if (nativeListenersBound)
      return

    sdk.Notifications.addEventListener('click', (event) => {
      void handleNotificationClick(event)
    })
    sdk.Notifications.addEventListener('permissionChange', () => {
      void refreshNativeState().then(syncCurrentDevice)
    })
    sdk.Notifications.addEventListener('foregroundWillDisplay', (event) => {
      const foregroundEvent = event as OneSignalNativeForegroundEvent
      foregroundEvent.getNotification().display()
      void refreshNativeState().then(syncCurrentDevice)
    })
    sdk.User.pushSubscription.addEventListener('change', () => {
      void refreshNativeState().then(syncCurrentDevice)
    })

    nativeListenersBound = true
  }

  async function applyUserIdentity(currentUser: AuthUser | null) {
    if (!state.value.initialized)
      return

    if (isNative.value) {
      const sdk = await loadNativeSdk()
      if (!sdk)
        return

      if (!currentUser) {
        if (identifiedUserId.value) {
          sdk.logout()
          identifiedUserId.value = null
        }
        return
      }

      if (identifiedUserId.value === currentUser.id)
        return

      sdk.login(currentUser.id)
      identifiedUserId.value = currentUser.id
      await refreshNativeState()
      await syncCurrentDevice()
      return
    }

    const sdk = await loadWebSdk(runtimeConfig)
    if (!sdk)
      return

    if (!currentUser) {
      if (identifiedUserId.value && sdk.logout)
        await maybeAwait(sdk.logout())

      identifiedUserId.value = null
      return
    }

    if (identifiedUserId.value === currentUser.id)
      return

    if (sdk.login)
      await maybeAwait(sdk.login(currentUser.id))

    identifiedUserId.value = currentUser.id
    await refreshWebState()
    await syncCurrentDevice()
  }

  async function initialize() {
    if (!isEnabled.value) {
      state.value.initialized = false
      state.value.supported = false
      state.value.permission = 'unsupported'
      return
    }

    ensureDeviceKey()

    if (state.value.initialized || initStarted.value)
      return

    initStarted.value = true

    if (isNative.value) {
      const sdk = await loadNativeSdk()
      if (!sdk) {
        state.value.permission = 'unsupported'
        state.value.supported = false
        initStarted.value = false
        return
      }

      sdk.initialize(runtimeConfig.public.oneSignalAppId)
      await bindNativeListeners(sdk)
      await refreshNativeState()
    } else {
      const sdk = await loadWebSdk(runtimeConfig)
      if (!sdk) {
        state.value.permission = 'unsupported'
        state.value.supported = false
        initStarted.value = false
        return
      }

      await bindWebListeners(sdk)
      await refreshWebState()
    }

    state.value.initialized = true
    initStarted.value = false
  }

  function bindAuthWatcher() {
    if (authWatcherBound)
      return

    watch(() => user.value?.id ?? null, () => {
      void applyUserIdentity(user.value)
    }, { immediate: true })

    authWatcherBound = true
  }

  async function bootstrap() {
    if (!isEnabled.value)
      return

    await initialize()
    bindAuthWatcher()
    await syncCurrentDevice()
  }

  async function enableCurrentDevice() {
    await initialize()
    if (!state.value.initialized)
      return false

    if (isNative.value) {
      const sdk = await loadNativeSdk()
      if (!sdk)
        return false

      await sdk.Notifications.requestPermission(true)
      sdk.User.pushSubscription.optIn()
      await refreshNativeState()
      await syncCurrentDevice()
      return isSubscribed.value
    }

    const sdk = await loadWebSdk(runtimeConfig)
    if (!sdk)
      return false

    if (state.value.permission === 'default' && sdk.Slidedown?.promptPush) {
      await sdk.Slidedown.promptPush()
    } else {
      await sdk.Notifications?.requestPermission?.()
    }

    await maybeAwait(sdk.User?.PushSubscription?.optIn?.())
    await refreshWebState()
    await syncCurrentDevice()
    return isSubscribed.value
  }

  async function disableCurrentDevice() {
    await initialize()
    if (!state.value.initialized)
      return

    if (isNative.value) {
      const sdk = await loadNativeSdk()
      if (!sdk)
        return

      sdk.User.pushSubscription.optOut()
      await refreshNativeState()
      await syncCurrentDevice()
      return
    }

    const sdk = await loadWebSdk(runtimeConfig)
    if (!sdk)
      return

    await maybeAwait(sdk.User?.PushSubscription?.optOut?.())
    await refreshWebState()
    await syncCurrentDevice()
  }

  return {
    bootstrap,
    disableCurrentDevice,
    enableCurrentDevice,
    initialize,
    isEnabled,
    isNative,
    isSubscribed,
    refreshState,
    state: readonly(state),
    syncCurrentDevice
  }
}

export const useOneSignal = createSharedComposable(_useOneSignal)
