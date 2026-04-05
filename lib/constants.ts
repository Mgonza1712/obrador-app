export const BASE_UNITS = ['ml', 'g', 'ud'] as const
export type BaseUnit = typeof BASE_UNITS[number]

export const PRODUCT_CATEGORIES = [
  'Cervezas',
  'Vinos y Licores',
  'Refrescos y Agua',
  'Café e Infusiones',
  'Carnes',
  'Pescados y Mariscos',
  'Frutas y Verduras',
  'Lácteos y Huevos',
  'Panadería y Bollería',
  'Congelados',
  'Conservas y Salsas',
  'Aceites y Condimentos',
  'Harinas y Cereales',
  'Limpieza e Higiene',
  'Descartables',
  'Equipamiento',
  'Servicios',
] as const
export type ProductCategory = typeof PRODUCT_CATEGORIES[number]

export const FORMATOS_COMPRA = [
  'Caja',
  'Barril',
  'Bidón',
  'Bolsa',
  'Unidad',
  'Kilogramo',
  'Retráctil',
] as const

export const PROVIDER_CHANNELS = ['email', 'whatsapp', 'telegram', 'telefono'] as const
export type ProviderChannel = typeof PROVIDER_CHANNELS[number]

export const PROVIDER_CHANNEL_LABELS: Record<string, string> = {
  email: 'Email',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  telefono: 'Teléfono',
}
