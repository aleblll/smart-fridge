---
id: "META-003"
title: "Role Matrix & Model Reasoning Allocation (Cloudflare Edge Edition)"
type: "model_matrix"
tier: "high"
author: "System-Architect-Gemini-3.8-Flash"
status: "accepted"
tags:
  - meta
  - agents
  - models
  - reasoning_budget
  - cloudflare
created_at: 2026-09-22T22:00:00Z
updated_at: 2026-09-22T23:50:00Z
related_documents:
  - "[[00_Meta/Project_Context.md]]"
  - "[[00_Meta/System_Invariants.md]]"
  - "[[04_Tasks/Backlog.md]]"
---

# Role Matrix & Model Reasoning Allocation (Cloudflare Edge Edition)

## 1. Сводная матрица ролей и квот рассуждений

| Роль / Агент | Модель | Thinking Tier | Зона ответственности | Допустимые операции |
|---|---|---|---|---|
| **System Architect (Главный Архитектор)** | **Gemini 3.8 Flash** | **High Thinking** | Проектирование Zero-VPS архитектуры, синтез ADR, структуры D1/Edge данных, спецификаций воркеров, декомпозиция задач в `04_Tasks/`. | Создание и редактирование `00_Meta/`, `01_Architecture/`, `02_Contracts/`, `03_Design_System/`, назначение задач в `04_Tasks/`. |
| **Frontend & TMA Lead** | **Gemini 3.7 Flash** | **Medium Thinking** | Разработка React 19 SPA (Vite), интеграция Telegram WebApp SDK, Vaul Drawer, Optimistic UI, Zustand-сторы, локальный поиск по `foodPresets.json`. | Запись в `src/`, `public/`, `package.json`, `vite.config.ts`. Обновление статуса своих задач в `04_Tasks/`. |
| **Cloud & Edge Integrations Engineer** | **Gemini 3.7 Flash** | **Medium Thinking** | Разработка Cloudflare Worker (`cloudflare-worker.js`), HMAC-валидация, DTO-санитизаторы, GitHub Actions workflow, Telegram Bot API. | Запись в `worker/`, `.github/workflows/`, `scripts/`. Обновление статуса задач в `04_Tasks/`. |
| **QA, Data & Hygiene Operator** | **Gemini 3.6 Flash** | **Low Thinking** | Валидация `foodPresets.json` (СанПиН/USDA), запуск линтеров (ESLint, Prettier), юнит-тесты чистых функций, обновление чек-листов DoD. | Запись в `tests/`, `src/data/foodPresets.json`, форматирование кода, обновление чекбоксов в `04_Tasks/`. |
