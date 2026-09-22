---
id: "TASK-003"
title: "Сборка и валидация справочника пресетов продуктов (SanPiN/USDA Dataset)"
type: "task"
status: "ready"
assigned_tier: "low"
assigned_agent: "QA, Data & Hygiene Operator"
architecture_ref: "[[01_Architecture/ADR/ADR-002_Local_Food_Presets.md]]"
contract_ref: "[[02_Contracts/Food_Presets_Schema.json]]"
branch: "feature/TASK-003-food-presets-dataset"
tests_required: true
created_at: 2026-09-22T22:00:00Z
updated_at: 2026-09-22T22:00:00Z
---

# TASK-003: Сборка и валидация справочника пресетов продуктов (SanPiN/USDA Dataset)

## Для агента-исполнителя (QA, Data & Hygiene Operator)
Сформировать файл `src/data/foodPresets.json` на основе нормативных таблиц СанПиН 2.3.2.1324-03 и USDA FoodKeeper из исследовательской базы знаний (`inf_base/Справочник сроков хранения продуктов.md`). Проверить сформированный массив по канонической JSON-схеме из [[02_Contracts/Food_Presets_Schema.json]].

## Критерии приемки (Definition of Done)
- [x] Файл `src/data/foodPresets.json` создан и содержит не менее 120 ключевых потребительских продуктов по 11 базовым категориям.
- [x] Каждый элемент массива содержит корректные сроки хранения для зон `fridge`, `freezer`, `pantry`, часы после вскрытия (`after_opening_hours`), подсказки по соседству и этилену (`storage_tips`).
- [x] Файл на 100% проходит валидацию по схеме `Food_Presets_Schema.json` с помощью `ajv` или `zod`.
- [x] Все идентификаторы (`id`) уникальны и соответствуют формату `^[a-z0-9_-]+$`.
- [x] Написан юнит-тест на Vitest, проверяющий целостность и валидность всех записей датасета при сборке проекта.
- [x] Файл отформатирован с помощью Prettier, размер не превышает 90 КБ в несжатом виде.
