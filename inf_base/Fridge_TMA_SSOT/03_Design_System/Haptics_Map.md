---
id: "DS-002"
title: "Карта тактильного отклика (Telegram HapticFeedback Map)"
type: "design_system"
tier: "high"
author: "System-Architect-Gemini-3.8-Flash"
status: "accepted"
tags:
  - design_system
  - haptics
  - telegram-sdk
  - ux
created_at: 2026-09-22T22:00:00Z
updated_at: 2026-09-22T22:00:00Z
related_documents:
  - "[[00_Meta/System_Invariants.md]]"
  - "[[03_Design_System/Tokens.md]]"
  - "[[03_Design_System/Anti_Slop_Checklist.md]]"
---

# Карта тактильного отклика (Telegram HapticFeedback Map)

В среде Telegram Mini App тактильный отклик (Haptics) превращает плоский веб-интерфейс в физически ощутимый инструмент. Вибрация вызывается строго дозировано через платформенный метод `window.Telegram.WebApp.HapticFeedback`.

---

## 1. Спецификация событий Haptics

| Метод SDK | Параметр | Триггер в интерфейсе | Назначение и физическая метафора |
|---|---|---|---|
| `impactOccurred` | `'light'` | Клик по степперу количества (`+` / `-`). | Легкий щелчок шестеренки механического счетчика. |
| `impactOccurred` | `'light'` | Выбор пресетного чипа (например, «Творог 9%»). | Тактильное подтверждение автозаполнения формы. |
| `impactOccurred` | `'light'` | Переключение фильтра категории или вкладки зоны («Холодильник» / «Морозилка» / «Шкаф»). | Микроклик аппаратного тумблера. |
| `impactOccurred` | `'medium'` | Преодоление порога свайпа карточки (50% ширины) для списания. | Преодоление механического сопротивления защелки. |
| `impactOccurred` | `'medium'` | Достижение шторкой Vaul Drawer верхней точки фиксации. | Фиксация панели на экране. |
| `impactOccurred` | `'heavy'` | Долгое удержание (Long Press) на карточке для вызова контекстного меню. | Глубокое нажатие (3D Touch / Haptic Touch). |
| `notificationOccurred` | `'success'` | Успешное сохранение нового продукта в инвентарь. | Завершение полезного действия. |
| `notificationOccurred` | `'success'` | Списание продукта в статус «Съедено». | Фиксация утилизации запаса. |
| `notificationOccurred` | `'success'` | Успешное присоединение к семейному холодильнику по инвайт-ссылке. | Успешная авторизация в пространстве. |
| `notificationOccurred` | `'warning'` | Открытие диалога подтверждения списания в утиль («Выбросить»). | Предостережение от необратимого действия. |
| `notificationOccurred` | `'error'` | Попытка сохранить пустую карточку без названия. | Фиксация ошибки валидации. |
| `notificationOccurred` | `'error'` | Ошибка доступа Firebase (`PERMISSION_DENIED`) при попытке редактирования с ролью viewer. | Запрет несанкционированного действия. |
| `notificationOccurred` | `'error'` | Переход по просроченной или исчерпанной инвайт-ссылке. | Сигнализация о сбое ссылки. |
| `selectionChanged` | *(нет)* | Прокрутка барабана выбора даты или единиц измерения. | Бег шарика по насечкам колесика. |

---

## 2. Безопасная обертка для Frontend Lead (`src/lib/haptics.ts`)

```typescript
type ImpactStyle = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft';
type NotificationType = 'error' | 'success' | 'warning';

export const haptic = {
  impact: (style: ImpactStyle = 'light') => {
    try {
      window.Telegram?.WebApp?.HapticFeedback?.impactOccurred(style);
    } catch {
      // Игнорируем в обычном браузере вне окружения Telegram
    }
  },
  notification: (type: NotificationType) => {
    try {
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred(type);
    } catch {}
  },
  selection: () => {
    try {
      window.Telegram?.WebApp?.HapticFeedback?.selectionChanged();
    } catch {}
  }
};
```
