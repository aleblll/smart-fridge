---
id: "TASK-001"
title: "Инициализация проекта React 19 SPA (Vite + Tailwind CSS v4) для GitHub Pages"
type: "task"
status: "done"
assigned_tier: "medium"
assigned_agent: "Frontend & TMA Lead"
architecture_ref: "[[01_Architecture/System_Topology.md]]"
contract_ref: "[[03_Design_System/Tokens.md]]"
branch: "feature/TASK-001-frontend-scaffolding"
tests_required: true
created_at: 2026-09-22T22:00:00Z
updated_at: 2026-09-23T00:24:00Z
---

# TASK-001: Инициализация проекта React 19 SPA (Vite + Tailwind CSS v4) для GitHub Pages

## Для агента-исполнителя (Frontend & TMA Lead)
Инициализировать легковесный каркас приложения на React 19 с TypeScript и Vite в соответствии с архитектурой Zero-VPS. Настроить билд для развертывания на GitHub Pages. Интегрировать Tailwind CSS и дизайн-токены Zinc/Neutral с нативными CSS-переменными Telegram WebApp.

## Критерии приемки (Definition of Done)
- [x] Проект развернут на стеке Vite + React 19 + TypeScript + Tailwind CSS.
- [x] Конфигурация `vite.config.ts` настроена с корректным `base: './'` (или именем репозитория) для бесшовной работы в GitHub Pages.
- [x] В `index.html` подключен нативный скрипт Telegram WebApp SDK: `<script src="https://telegram.org/js/telegram-web-app.js"></script>`.
- [x] Подключены дизайн-токены из [[03_Design_System/Tokens.md]] с поддержкой темной и светлой темы через переменные Telegram.
- [x] Размер итогового JS-бандла после сборки `npm run build` не превышает 90 КБ в gzipped-виде.
- [x] Отсутствуют сторонние веб-шрифты (используется системный шрифтовой стек устройств).
- [x] Настроен базовый тест сборки и проверка линтера (ESLint + TypeScript без ошибок).
