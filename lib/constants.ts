export const BASE_UNITS = ['ml', 'g', 'ud'] as const
export type BaseUnit = typeof BASE_UNITS[number]

export const PRODUCT_CATEGORIES = [
  'Bebidas Alcohólicas',
  'Bebidas Sin Alcohol',
  'Alimentos Secos',
  'Alimentos Frescos',
  'Lácteos',
  'Limpieza',
  'Descartables',
  'Otros',
] as const
export type ProductCategory = typeof PRODUCT_CATEGORIES[number]

export const PROVIDER_CHANNELS = ['email', 'whatsapp', 'telegram', 'telefono'] as const
export type ProviderChannel = typeof PROVIDER_CHANNELS[number]

export const PROVIDER_CHANNEL_LABELS: Record<string, string> = {
  email: 'Email',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  telefono: 'Teléfono',
}
