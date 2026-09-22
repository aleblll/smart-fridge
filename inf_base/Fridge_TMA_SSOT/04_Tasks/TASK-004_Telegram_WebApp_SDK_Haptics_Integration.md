---
id: "TASK-004"
title: "Интеграция Telegram WebApp SDK, блокировка свайпов и тактильный отклик"
type: "task"
status: "done"
assigned_tier: "medium"
assigned_agent: "Frontend & TMA Lead"
architecture_ref: "[[01_Architecture/System_Topology.md]]"
contract_ref: "[[03_Design_System/Haptics_Map.md]]"
branch: "feature/TASK-004-telegram-sdk-haptics"
tests_required: true
created_at: 2026-09-22T22:00:00Z
updated_at: 2026-09-23T00:45:00Z
---

# TASK-004: Интеграция Telegram WebApp SDK, блокировка свайпов и тактильный отклик

## Для агента-исполнителя (Frontend & TMA Lead)
Реализовать сервисный слой интеграции с Telegram WebApp SDK. Обеспечить корректный жизненный цикл приложения в WebView, заблокировать закрытие по паразитным вертикальным свайпам, настроить синхронизацию системных цветов темы мессенджера и подключить тактильный отклик (HapticFeedback).

## Критерии приемки (Definition of Done)
- [x] Создан хук `useTelegramWebApp` или провайдер `TelegramProvider`.
- [x] При старте приложения вызываются `Telegram.WebApp.ready()`, `Telegram.WebApp.expand()` и `Telegram.WebApp.disableVerticalSwipes()`.
- [x] Реализован модуль `src/lib/haptics.ts` в соответствии со спецификацией [[03_Design_System/Haptics_Map.md]].
- [x] Протестировано безопасное выполнение в обычном браузере (SSR/десктопный режим без падения приложения).
- [x] Реализована подписка на событие `themeChanged` Telegram WebApp для динамического обновления CSS-переменных при переключении темы оформления в мессенджере.
- [x] Нижняя шторка добавления продукта построена на `vaul` с корректной изоляцией скролла (жест внутри шторки не закрывает TMA).
- [x] Пройдена проверка по чек-листу [[03_Design_System/Anti_Slop_Checklist.md]] (пункты 4, 5, 6, 7).
