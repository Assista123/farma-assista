# Farma Assista

AI conversational farm manager for poultry farmers.  
Live on **Telegram** and **WhatsApp**.

Farmers can log feed, mortality, egg production, weight, expenses, sales, and more through simple chat. The system tracks performance, flags deviations early, and gives real-time visibility into farm operations.

## Features

- **Conversational interface** on Telegram & WhatsApp
- **Flock management** – create and close flocks
- **Logging**
  - Feed intake
  - Egg production
  - Mortality
  - Weight
  - Litter
  - Expenses
  - Sales
  - Drugs / medication
  - Vaccination
- **Stock management**
- **Health diagnosis** support
- **Deviation / early-warning alerts** (feed drop, production downtrend, weight-gain lag, etc.)
- **Reports** for farmers and dealers
- **Onboarding** flow for new users
- Scheduled notifications

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js |
| Telegram | Grammy |
| WhatsApp | WhatsApp Business Cloud API (webhooks) |
| AI | Google Gemini (`@google/generative-ai`) |
| Database | Supabase |
| Cache / state | Redis (Upstash + ioredis) |
| Scheduling | node-cron |
| Web | Express + static `public/` |

## Project Structure

```text
farma-assista/
├── index.js              # Entry point (Express + bot + scheduler)
├── package.json
├── public/               # Static / landing assets
└── src/
    ├── bot/              # Telegram (Grammy)
    ├── whatsapp/         # WhatsApp webhook handler
    ├── flows/            # Conversation flows (onboarding, logging, etc.)
    ├── services/         # Business logic
    ├── config/
    ├── utils/
    └── scheduler.js
