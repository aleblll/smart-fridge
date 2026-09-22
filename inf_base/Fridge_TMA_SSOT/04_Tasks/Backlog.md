---
id: "TASK-REG-001"
title: "Project Backlog: Реестр инженерных задач (Cloudflare Edition)"
type: "registry"
tier: "high"
author: "System-Architect-Gemini-3.8-Flash"
status: "active"
tags:
  - tasks
  - backlog
  - ssot
  - management
created_at: 2026-09-22T22:00:00Z
updated_at: 2026-09-22T23:50:00Z
related_documents:
  - "[[04_Tasks/In_Progress.md]]"
  - "[[04_Tasks/Done.md]]"
  - "[[04_Tasks/Sprint_01_Backlog.md]]"
---

# Project Backlog: Реестр инженерных задач (Cloudflare Edition)

Реестр архитектурных задач проекта «Умный холодильник» на бессерверном стеке Cloudflare Worker Edge (по образцу `samgtu-schedule`).

---

## Актуальный бэклог спринта

| ID | Задача | Исполнитель (Агент) | Thinking Tier | Контракт / Ссылка | Статус |
|---|---|---|---|---|---|
| **TASK-001** | [[04_Tasks/TASK-001_Frontend_Project_Scaffolding.md\|Scaffolding React 19 SPA (Vite + Tailwind v4)]] | Frontend & TMA Lead | Medium | [[03_Design_System/Tokens.md]] | `ready` |
| **TASK-002** | [[04_Tasks/TASK-002_Cloudflare_Worker_Gateway.md\|Разработка Cloudflare Worker Edge Gateway]] | Cloud & Integrations | Medium | [[01_Architecture/Cloudflare_Worker_Spec.md]] | `ready` |
| **TASK-003** | [[04_Tasks/TASK-003_SanPiN_Food_Presets_Dataset.md\|Сборка справочника foodPresets.json (СанПиН/USDA)]] | QA & Hygiene Operator | Low | [[02_Contracts/Food_Presets_Schema.json]] | `ready` |
| **TASK-004** | [[04_Tasks/TASK-004_Telegram_WebApp_SDK_Haptics_Integration.md\|Интеграция Telegram SDK, свайпы и Haptics]] | Frontend & TMA Lead | Medium | [[03_Design_System/Haptics_Map.md]] | `ready` |
| **TASK-005** | [[04_Tasks/TASK-005_GitHub_Actions_Daily_Notifier.md\|Скрипт уведомлений в GitHub Actions Cron]] | Cloud & Integrations | Medium | [[01_Architecture/ADR/ADR-003_GitHub_Actions_Push_Cron.md]] | `ready` |
