import jwt from 'jsonwebtoken';
import { Token } from '../models/token.model.js';

export const generateTokens = async (userId) => {
  const accessToken = jwt.sign(
    { id: userId.toString() },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRY || '15m' }
  );
  const refreshToken = jwt.sign(
    { id: userId.toString() },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRY || '7d' }
  );

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);
  await Token.create({ user: userId, token: refreshToken, expiresAt });

  return { accessToken, refreshToken };
};

export const setTokenCookies = (res, accessToken, refreshToken) => {
  const isProd = process.env.NODE_ENV === 'production';

  const base = {
    httpOnly: true,
    secure:   isProd,               // HTTPS only in prod
    sameSite: isProd ? 'none' : 'lax', // 'none' required for cross-domain (Railway ↔ Vercel)
  };

  res.cookie('accessToken',  accessToken,  { ...base, maxAge: 15 * 60 * 1000 });
  res.cookie('refreshToken', refreshToken, { ...base, maxAge: 7 * 24 * 60 * 60 * 1000 });
};