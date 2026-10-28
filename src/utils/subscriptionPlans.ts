// Prices match the checkout catalog in payment.constants.ts; amounts are UZS.
export const subscriptionPlans = [
  { key: 'tekin', color: '#64748B', prices: [0, 0, 0], uz: ['Bepul boshlash'], ru: ['Бесплатный старт'] },
  { key: 'bor', color: '#10B981', prices: [44000, 237600, 422400], uz: ['100 ta mahsulotgacha', 'Savdo va qarzdorlar', 'Offline sinxronlash'], ru: ['До 100 товаров', 'Продажи и должники', 'Офлайн-синхронизация'] },
  { key: 'pro', color: '#7C3AED', prices: [99000, 534600, 950400], uz: ['Cheksiz mahsulot', 'To‘liq statistika va reyting', 'Telegram hisobotlari', 'Ustuvor yordam'], ru: ['Безлимитные товары', 'Полная статистика и рейтинг', 'Отчёты в Telegram', 'Приоритетная поддержка'] },
] as const
export const subscriptionBotUrl = 'https://t.me/hisvex_bot?start=obuna'
export function subscriptionPriceLines(prices: readonly number[], language: string) {
  if (prices[0] === 0) return language === 'ru' ? 'Бесплатно' : 'Bepul'
  return [1, 6, 12].map((months, i) => `${months} ${language === 'ru' ? 'мес.' : 'oy'}: ${prices[i].toLocaleString('uz-UZ')} ${language === 'ru' ? 'сум' : 'so‘m'}`).join(' · ')
}
