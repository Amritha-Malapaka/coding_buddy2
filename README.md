# Coding Platform

Full-stack coding platform with Next.js frontend and Express backend.

## Features

- **Homepage**: List of coding problems with difficulty levels
- **Problem Page**: Problem description, examples, constraints, and code editor
- **Login Page**: Authentication with demo accounts
- **Dark theme** clean UI

## Tech Stack

- **Frontend**: Next.js 14 + React + TypeScript + Tailwind CSS
- **Backend**: Node.js + Express
- **API**: RESTful API with CORS enabled

## Project Structure

```
coding_buddy2/
├── backend/
│   ├── package.json
│   └── server.js          # Express server with API routes
├── frontend/
│   ├── app/
│   │   ├── globals.css     # Global styles (dark theme)
│   │   ├── layout.tsx      # Root layout
│   │   ├── page.tsx        # Home page (problem list)
│   │   ├── login/
│   │   │   └── page.tsx    # Login page
│   │   └── problem/
│   │       └── [id]/
│   │           └── page.tsx # Problem detail page
│   ├── package.json
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   └── next.config.js
├── package.json            # Root with concurrent dev script
└── README.md
```

## Setup Instructions

### 1. Install all dependencies

```bash
cd /Users/amrithamalapaka/Documents/coding_buddy2
npm run install:all
```

Or manually:
```bash
cd backend && npm install
cd ../frontend && npm install
```

### 2. Start both servers

```bash
npm run dev
```

This starts:
- Backend: http://localhost:5000
- Frontend: http://localhost:3000

Or start individually:
```bash
npm run dev:backend   # Terminal 1
npm run dev:frontend  # Terminal 2
```

## Demo Accounts

| Username | Password |
|----------|----------|
| admin    | admin    |
| user1    | pass1    |
| user2    | pass2    |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET    | /api/problems | List all problems |
| GET    | /api/problems/:id | Get problem details |
| POST   | /api/login | Login (username, password) |
| POST   | /api/logout | Logout |
| GET    | /api/me | Get current user |

## Pre-loaded Problems

1. Two Sum (Easy)
2. Reverse Linked List (Easy)
3. Binary Search (Medium)
4. Merge Intervals (Medium)
5. N-Queens (Hard)
