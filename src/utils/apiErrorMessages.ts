type ApiLanguage = 'uz' | 'ru'

// Local transport/offline errors and compatibility with older API responses.
const messages: [string, string, string][] = [
  ["Invalid username or password","Login yoki parol noto‘g‘ri","Неверный логин или пароль"],
  ["Username already exists","Bu login allaqachon mavjud","Такой логин уже существует"],
  ["Invalid or expired token","Sessiya muddati tugagan. Qayta kiring","Сессия истекла. Войдите снова"],
  ["Invalid or expired refresh token","Sessiya muddati tugagan. Qayta kiring","Сессия истекла. Войдите снова"],
  ["User not found","Foydalanuvchi topilmadi","Пользователь не найден"],
  ["Unauthorized","Hisobingizga kiring","Войдите в аккаунт"],
  ["Forbidden","Bu amal uchun ruxsat yo‘q","Нет доступа к этому действию"],
  ["API xatoligi","So‘rovni bajarib bo‘lmadi. Qayta urinib ko‘ring","Не удалось выполнить запрос. Повторите попытку"],
  ["Network Error","Tarmoq xatoligi. Server bilan aloqa yo‘q.","Ошибка сети. Нет связи с сервером."],
  ["Failed to fetch","Tarmoq xatoligi. Server bilan aloqa yo‘q.","Ошибка сети. Нет связи с сервером."],
  ["Tarmoq xatoligi. Server bilan aloqa yo'q.","Tarmoq xatoligi. Server bilan aloqa yo‘q.","Ошибка сети. Нет связи с сервером."],
  ["So'rov vaqti tugadi. Internet aloqasini tekshiring.","So‘rov vaqti tugadi. Internet aloqasini tekshiring.","Время ожидания истекло. Проверьте интернет."],
  ["Tokenni yangilash uchun server bilan aloqa yo‘q","Sessiyani yangilash uchun server bilan aloqa yo‘q","Нет связи с сервером для обновления сессии"],
  ["Tarmoq xatoligi. Tokenni yangilab bo'lmadi.","Tarmoq xatoligi. Sessiyani yangilab bo‘lmadi.","Ошибка сети. Не удалось обновить сессию."],
  ["Avtorizatsiya tugagan. Qayta kiring.","Sessiya muddati tugagan. Qayta kiring.","Сессия истекла. Войдите снова."],
  ["Hisob yoki sessiya o‘zgardi","Hisob yoki sessiya o‘zgardi. Qayta urinib ko‘ring","Аккаунт или сессия изменились. Повторите попытку"],
  ["Sessiya o‘zgardi","Sessiya o‘zgardi. Qayta urinib ko‘ring","Сессия изменилась. Повторите попытку"],
  ["Hisob o‘zgardi","Hisob o‘zgardi. Qayta urinib ko‘ring","Аккаунт изменился. Повторите попытку"],
  ["Avval hisobga kiring","Avval hisobga kiring","Сначала войдите в аккаунт"],
  ["Amal ma’lumotlari noto‘g‘ri","Amal ma’lumotlari noto‘g‘ri","Неверные данные операции"],
  ["Brauzer xavfsiz amal saqlovini qo‘llamaydi","Bu brauzerda amalni saqlab bo‘lmadi. Boshqa brauzerda urinib ko‘ring","Не удалось сохранить операцию в этом браузере. Попробуйте другой браузер"],
  ["Server amalni rad etdi","Server amalni rad etdi","Сервер отклонил операцию"],
  ["Kirish so‘roviga javob olinmadi. Birozdan keyin qayta urinib ko‘ring.","Kirish so‘roviga javob olinmadi. Birozdan keyin qayta urinib ko‘ring.","Нет ответа на запрос входа. Попробуйте чуть позже."],
  ["Server bilan bog‘lanib bo‘lmadi. Internetni tekshiring.","Server bilan bog‘lanib bo‘lmadi. Internetni tekshiring.","Не удалось связаться с сервером. Проверьте интернет."],
  ["Mahsulot topilmadi","Mahsulot topilmadi","Товар не найден"],
  ["Rasm yuklash uchun internet aloqasi kerak.","Rasm yuklash uchun internet aloqasi kerak.","Для загрузки изображения нужен интернет."],
  ["Serverga ulanib bo‘lmadi; navbat saqlanadi","Serverga ulanib bo‘lmadi; yuborilmagan amallar saqlanadi","Нет связи с сервером; неотправленные операции сохранены"],
  ["Server yangilanishi kerak; navbat saqlanadi","Serverni yangilash kerak; yuborilmagan amallar saqlanadi","Сервер нужно обновить; неотправленные операции сохранены"],
  ["Sync sahifasi tugallanmagan","Sinxronlash ma’lumotlari to‘liq olinmadi. Qayta urinib ko‘ring","Данные синхронизации получены не полностью. Повторите попытку"],
  ["Sync checkpoint olinmadi","Sinxronlash tasdig‘i olinmadi. Qayta urinib ko‘ring","Подтверждение синхронизации не получено. Повторите попытку"],
  ["Server sync versiyasi mos emas; navbat saqlanadi","Server sinxronlash versiyasi mos emas; yuborilmagan amallar saqlanadi","Версия синхронизации сервера не совпадает; неотправленные операции сохранены"],
  ["Internet aloqasi yo'q. Oflayn rejim.","Internet aloqasi yo‘q. Oflayn rejim.","Нет интернета. Автономный режим."],
  ["Internet aloqasi yo'q.","Internet aloqasi yo‘q.","Нет интернета."],
  ["Adminlar ro'yxatini yuklash uchun server kerak","Foydalanuvchilar ro‘yxatini yuklash uchun serverga ulaning","Для загрузки списка пользователей подключитесь к серверу"],
  ["Admin yaratish uchun server kerak","Foydalanuvchi yaratish uchun serverga ulaning","Для создания пользователя подключитесь к серверу"],
  ["Admin tahrirlash uchun server kerak","Foydalanuvchini tahrirlash uchun serverga ulaning","Для изменения пользователя подключитесь к серверу"],
  ["Admin o'chirish uchun server kerak","Foydalanuvchini o‘chirish uchun serverga ulaning","Для удаления пользователя подключитесь к серверу"],
  ["Statistika yuklash uchun server kerak","Statistikani yuklash uchun serverga ulaning","Для загрузки статистики подключитесь к серверу"],
  ["Qarzdorlar ro'yxatini yuklash uchun server kerak","Qarzdorlar ro‘yxatini yuklash uchun serverga ulaning","Для загрузки списка должников подключитесь к серверу"],
  ["Qarzdorni yuklash uchun server kerak","Qarzdor ma’lumotlarini yuklash uchun serverga ulaning","Для загрузки данных должника подключитесь к серверу"],
  ["Qarzdor yaratish uchun server kerak","Qarzdor yaratish uchun serverga ulaning","Для создания должника подключитесь к серверу"],
  ["Qarzdorni tahrirlash uchun server kerak","Qarzdorni tahrirlash uchun serverga ulaning","Для изменения должника подключитесь к серверу"],
  ["Qarzni o'zgartirish uchun server kerak","Qarzni o‘zgartirish uchun serverga ulaning","Для изменения долга подключитесь к серверу"],
  ["Qarzdorni o'chirish uchun server kerak","Qarzdorni o‘chirish uchun serverga ulaning","Для удаления должника подключитесь к серверу"],
  ["Server kerak","Serverga ulaning","Подключитесь к серверу"],
  ["Telegram botini ochib bo‘lmadi","Telegram botini ochib bo‘lmadi","Не удалось открыть Telegram-бота"],
  ["Tasdiqlash muddati tugadi. Botni qayta oching.","Tasdiqlash muddati tugadi. Botni qayta oching.","Срок подтверждения истёк. Откройте бота снова."],
  ["Tekshirib bo‘lmadi","Tekshirib bo‘lmadi. Qayta urinib ko‘ring","Не удалось проверить. Повторите попытку"],
]

const normalize = (message: string) => message.replace(/[‘’]/g, "'")
const lookup = new Map<string, { uz: string; ru: string }>()
for (const [message, uz, ru] of messages) {
  for (const text of [message, uz, ru]) lookup.set(normalize(text), { uz, ru })
}

export function translateApiMessage(message: string, language: ApiLanguage): string {
  const translated = lookup.get(normalize(message))
  if (translated) return translated[language]
  if (/^Request failed with status code \d+$/.test(message)) {
    return language === 'ru' ? 'Не удалось выполнить запрос. Повторите попытку' : 'So‘rovni bajarib bo‘lmadi. Qayta urinib ko‘ring'
  }
  return message
}
