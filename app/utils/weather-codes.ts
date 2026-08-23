// Mapa reduzido dos WMO Weather Codes retornados pela Open-Meteo
// (https://open-meteo.com/en/docs — API gratuita, sem chave) pra um ícone
// Lucide + descrição em português. Não cobre todos os ~30 códigos WMO, só
// os grupos relevantes pra exibição — códigos fora da lista caem no default.

interface WeatherCodeInfo {
  icon: string
  label: string
}

const WEATHER_CODE_MAP: Record<number, WeatherCodeInfo> = {
  0: { icon: 'i-lucide-sun', label: 'Céu limpo' },
  1: { icon: 'i-lucide-sun', label: 'Poucas nuvens' },
  2: { icon: 'i-lucide-cloud-sun', label: 'Parcialmente nublado' },
  3: { icon: 'i-lucide-cloud', label: 'Nublado' },
  45: { icon: 'i-lucide-cloud-fog', label: 'Neblina' },
  48: { icon: 'i-lucide-cloud-fog', label: 'Neblina com geada' },
  51: { icon: 'i-lucide-cloud-drizzle', label: 'Garoa fraca' },
  53: { icon: 'i-lucide-cloud-drizzle', label: 'Garoa' },
  55: { icon: 'i-lucide-cloud-drizzle', label: 'Garoa forte' },
  61: { icon: 'i-lucide-cloud-rain', label: 'Chuva fraca' },
  63: { icon: 'i-lucide-cloud-rain', label: 'Chuva' },
  65: { icon: 'i-lucide-cloud-rain-wind', label: 'Chuva forte' },
  71: { icon: 'i-lucide-cloud-snow', label: 'Neve fraca' },
  73: { icon: 'i-lucide-cloud-snow', label: 'Neve' },
  75: { icon: 'i-lucide-cloud-snow', label: 'Neve forte' },
  80: { icon: 'i-lucide-cloud-rain', label: 'Pancadas de chuva' },
  81: { icon: 'i-lucide-cloud-rain', label: 'Pancadas de chuva' },
  82: { icon: 'i-lucide-cloud-rain-wind', label: 'Pancadas de chuva forte' },
  95: { icon: 'i-lucide-cloud-lightning', label: 'Tempestade' },
  96: { icon: 'i-lucide-cloud-lightning', label: 'Tempestade com granizo' },
  99: { icon: 'i-lucide-cloud-lightning', label: 'Tempestade forte com granizo' }
}

export function getWeatherInfo(code: number | null | undefined): WeatherCodeInfo {
  if (code === null || code === undefined) return { icon: 'i-lucide-cloud', label: 'Clima' }
  return WEATHER_CODE_MAP[code] ?? { icon: 'i-lucide-cloud', label: 'Clima' }
}
