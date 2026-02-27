# Streamify — Backend API

> A secure, scalable REST API built with **Node.js**, **Express 5**, and **MongoDB** — powering image upload, user authentication, and cloud storage management.

[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-v5-000000?style=flat-square&logo=express&logoColor=white)](https://expressjs.com)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?style=flat-square&logo=mongodb&logoColor=white)](https://mongodb.com)
[![Cloudinary](https://img.shields.io/badge/Cloudinary-Storage-3448C5?style=flat-square&logo=cloudinary&logoColor=white)](https://cloudinary.com)
[![License](https://img.shields.io/badge/License-ISC-blue?style=flat-square)](LICENSE)

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Features](#features)
- [Project Structure](#project-structure)
- [Database Schema](#database-schema)
- [API Reference](#api-reference)
- [Environment Variables](#environment-variables)
- [Getting Started](#getting-started)
- [Deployment](#deployment)
- [Security](#security)

---

## Overview

Streamify's backend is a production-ready REST API that handles user authentication using **JWT access/refresh token rotation**, image uploads to **Cloudinary** via in-memory buffer streaming, and per-user storage quota enforcement. Built on **Express 5** with full async error propagation and MongoDB Atlas for persistence.

---

## Tech Stack

| Technology | Version | Purpose |
|---|---|---|
| Node.js | 18+ | Runtime |
| Express | 5.x | Web framework |
| MongoDB | Atlas | Database |
| Mongoose | 9.x | ODM |
| Cloudinary | 1.x | Image cloud storage |
| Multer | 2.x | Multipart file handling |
| JSON Web Token | 9.x | Authentication |
| bcryptjs | 3.x | Password hashing |
| cookie-parser | 1.x | Cookie management |
| dotenv | 17.x | Environment config |

---

## Architecture

```
Client Request
      │
      ▼
  Express App
      │
      ├── CORS Middleware (origin whitelist)
      ├── Cookie Parser
      ├── JSON Body Parser
      │
      ├── /api/auth ──► Auth Router ──► Auth Controller
      │                                      │
      │                               User Model (MongoDB)
      │                               Token Model (MongoDB)
      │
      ├── /api/files ──► protect Middleware (JWT verify)
      │                       │
      │                  File Router ──► File Controller
      │                                      │
      │                               ┌──────┴──────┐
      │                          File Model    Cloudinary
      │                         (MongoDB)    (Buffer Upload)
      │
      └── Global Error Handler
```

---

## Features

- **JWT Authentication** — Access tokens (15 min) + Refresh tokens (7 days) with automatic rotation
- **Secure Cookies** — `httpOnly`, `secure`, `sameSite` cookies with cross-domain support in production
- **Image Upload** — Single or multiple image uploads (max 10 files, 5MB each) via Cloudinary
- **Storage Quota** — Per-user 5MB quota tracked via DB aggregation (immune to drift)
- **Protected Routes** — All file routes require valid authentication
- **User Isolation** — Users can only access, upload, and delete their own files
- **Account Management** — Register, login, logout, update profile, change password, delete account
- **Token Cleanup** — MongoDB TTL index auto-expires refresh tokens; password change invalidates all sessions
- **Error Handling** — Centralized error middleware covering Mongoose, JWT, Multer, and Cloudinary errors

---

## Project Structure

```
backend/
├── src/
│   ├── config/
│   │   ├── db.js                 # MongoDB connection
│   │   └── cloudinary.js        # Cloudinary config + upload helper
│   │
│   ├── controllers/
│   │   ├── auth.controller.js   # register, login, logout, profile, password
│   │   └── file.controller.js   # upload, list, delete, bulk delete, recalc
│   │
│   ├── middleware/
│   │   └── auth.middleware.js   # JWT verification + token rotation
│   │
│   ├── models/
│   │   ├── user.model.js        # User schema + password hashing
│   │   ├── file.model.js        # File metadata schema
│   │   └── token.model.js       # Refresh token schema (TTL indexed)
│   │
│   ├── routes/
│   │   ├── auth.routes.js       # Auth endpoints
│   │   └── file.routes.js       # File endpoints
│   │
│   ├── utils/
│   │   ├── generateTokens.js    # JWT generation + cookie setting
│   │   └── ApiResponse.js       # Standardized response helpers
│   │
│   └── app.js                   # Express app setup + middleware chain
│
├── server.js                    # Entry point (dotenv → connectDB → listen)
├── .env                         # Local environment variables (not committed)
├── .env.example                 # Environment variable template
├── .gitignore
└── package.json
```

---

## Database Schema

### User
```js
{
  _id:          ObjectId,
  username:     String (3–20 chars, unique),
  email:        String (unique, lowercase),
  password:     String (bcrypt hashed, select: false),
  avatar: {
    url:        String,
    publicId:   String
  },
  storageUsed:  Number (bytes, default: 0),
  storageLimit: Number (bytes, default: 5242880 = 5MB),
  createdAt:    Date,
  updatedAt:    Date
}
```

### File
```js
{
  _id:          ObjectId,
  owner:        ObjectId (ref: User, indexed),
  originalName: String,
  mimeType:     String,
  size:         Number (bytes),
  cloudinary: {
    url:        String,
    publicId:   String,
    format:     String
  },
  createdAt:    Date,
  updatedAt:    Date
}
```

### Token
```js
{
  _id:       ObjectId,
  user:      ObjectId (ref: User, indexed),
  token:     String (unique),
  expiresAt: Date (TTL index — MongoDB auto-deletes expired tokens),
  createdAt: Date
}
```

---

## API Reference

### Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/auth/register` | ✗ | Create new account |
| `POST` | `/api/auth/login` | ✗ | Login, receive tokens |
| `POST` | `/api/auth/logout` | ✓ | Logout, clear tokens |
| `GET` | `/api/auth/me` | ✓ | Get current user |
| `PUT` | `/api/auth/update-profile` | ✓ | Update username / avatar |
| `PUT` | `/api/auth/change-password` | ✓ | Change password (invalidates all sessions) |
| `DELETE` | `/api/auth/delete-account` | ✓ | Delete account + all files |

#### `POST /api/auth/register`
```json
// Request body
{ "username": "johndoe", "email": "john@example.com", "password": "secret123" }

// Response 201
{ "success": true, "message": "Account created successfully", "data": { "user": { ... } } }
```

#### `POST /api/auth/login`
```json
// Request body
{ "email": "john@example.com", "password": "secret123" }

// Response 200 — sets httpOnly cookies: accessToken, refreshToken
{ "success": true, "message": "Logged in successfully", "data": { "user": { ... } } }
```

---

### Files

> All file routes require authentication via cookies.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/files/upload` | Upload 1–10 images (multipart/form-data, field: `files`) |
| `GET` | `/api/files` | Get paginated list of user's files |
| `DELETE` | `/api/files/:id` | Delete single file |
| `DELETE` | `/api/files/bulk` | Delete multiple files |
| `POST` | `/api/files/recalc-storage` | Recalculate storage from DB (repair endpoint) |

#### `GET /api/files?page=1&limit=20`
```json
{
  "success": true,
  "data": {
    "files": [ { "_id": "...", "originalName": "photo.jpg", "size": 204800, "cloudinary": { "url": "https://..." }, "createdAt": "..." } ],
    "pagination": { "page": 1, "limit": 20, "total": 3, "pages": 1 }
  }
}
```

#### `POST /api/files/upload`
```
Content-Type: multipart/form-data
Body: files[] (image files, max 10, max 5MB each)
```
```json
// Response 201
{
  "success": true,
  "message": "3 file(s) uploaded successfully",
  "data": {
    "files": [ { ... } ],
    "storageUsed": 614400,
    "storageLimit": 5242880
  }
}
```

#### `DELETE /api/files/bulk`
```json
// Request body
{ "fileIds": ["id1", "id2", "id3"] }

// Response 200
{ "success": true, "message": "3 file(s) deleted successfully", "data": { "storageUsed": 0, "storageLimit": 5242880 } }
```

---

### Error Response Format
All errors follow this structure:
```json
{ "success": false, "message": "Human readable error message" }
```

| Status | Meaning |
|--------|---------|
| `400` | Bad request / validation error |
| `401` | Unauthenticated |
| `404` | Resource not found |
| `409` | Conflict (duplicate email/username) |
| `500` | Internal server error |

---

## Environment Variables

Create a `.env` file in the root of the backend:

```env
# Server
PORT=5000
NODE_ENV=development

# Database
MONGO_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/streamify_db

# JWT
ACCESS_TOKEN_SECRET=your_32_char_secret_here
REFRESH_TOKEN_SECRET=your_32_char_secret_here
ACCESS_TOKEN_EXPIRY=15m
REFRESH_TOKEN_EXPIRY=7d

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# CORS
CLIENT_URL=http://localhost:5173
```

> **Never commit `.env` to version control.** See `.env.example` for the template.

---

## Getting Started

### Prerequisites
- Node.js 18+
- MongoDB Atlas account
- Cloudinary account

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/yourusername/streamify-backend.git
cd streamify-backend

# 2. Install dependencies
npm install

# 3. Create your environment file
cp .env.example .env
# Fill in your values in .env

# 4. Start development server (with auto-reload)
npm run dev

# 5. Start production server
npm start
```

### Available Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `nodemon server.js` | Development with hot reload |
| `start` | `node server.js` | Production server |

### Verify It's Running

```bash
curl http://localhost:5000/api/health
# → { "status": "OK", "env": "development" }
```

---

## Deployment

### Deploy to Railway

1. Push to GitHub
2. Connect repo on [railway.app](https://railway.app)
3. Set **Start Command**: `node server.js`
4. Add all environment variables in the Railway dashboard
5. Set `NODE_ENV=production` and `CLIENT_URL=https://your-frontend.vercel.app`

### MongoDB Atlas — Allow Railway IPs
In Atlas → Network Access → Add IP Address → `0.0.0.0/0`

---

## Security

| Measure | Implementation |
|---------|----------------|
| Password hashing | bcryptjs with salt rounds = 12 |
| JWT access tokens | Short-lived (15 min), `httpOnly` cookie |
| JWT refresh tokens | Long-lived (7 days), rotated on every use |
| Cookie flags | `httpOnly`, `secure` (prod), `sameSite: none` (cross-domain) |
| User isolation | All DB queries filter by `owner: req.user._id` |
| File validation | MIME type whitelist + 5MB size limit enforced server-side |
| Token revocation | Refresh tokens stored in DB; password change deletes all sessions |
| TTL cleanup | MongoDB TTL index auto-deletes expired refresh tokens |

---

## Author

**Zohaib** — [GitHub](https://github.com/Iamzohaibali) · [LinkedIn](https://www.linkedin.com/in/zohaib-ahmad-ali-dev/)

---

> Built with ❤️ using the MERN stack