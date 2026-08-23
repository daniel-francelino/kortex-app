// Captura de geolocalização + clima do momento, sob ação explícita da
// pessoa (nunca automático) — via APIs nativas do navegador e a Open-Meteo
// (gratuita, sem chave: https://open-meteo.com/en/docs).

export interface WeatherSnapshot {
  latitude: number
  longitude: number
  weatherTempC: number
  weatherCode: number
}

function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocalização não suportada neste navegador.'))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10_000 })
  })
}

export async function captureWeatherSnapshot(): Promise<WeatherSnapshot> {
  const position = await getCurrentPosition()
  const { latitude, longitude } = position.coords

  const response = await $fetch<{
    current?: { temperature_2m?: number, weather_code?: number }
  }>('https://api.open-meteo.com/v1/forecast', {
    query: {
      latitude,
      longitude,
      current: 'temperature_2m,weather_code',
      timezone: 'auto'
    }
  })

  if (response.current?.temperature_2m === undefined || response.current?.weather_code === undefined) {
    throw new Error('Não foi possível obter o clima.')
  }

  return {
    latitude,
    longitude,
    weatherTempC: response.current.temperature_2m,
    weatherCode: response.current.weather_code
  }
}
