import jwt from 'jsonwebtoken';
import { User } from '../models/user.model.js';
import { Token } from '../models/token.model.js';
import { generateTokens, setTokenCookies } from '../utils/generateTokens.js';

export const protect = async (req, res, next) => {
  const accessToken = req.cookies?.accessToken;
  const refreshToken = req.cookies?.refreshToken;

  // No tokens at all → not logged in
  if (!accessToken && !refreshToken) {
    return res.status(401).json({ success: false, message: 'Not authenticated. Please log in.' });
  }

  // ── Try access token first ────────────────────────────────────────────────
  if (accessToken) {
    try {
      const decoded = jwt.verify(accessToken, process.env.ACCESS_TOKEN_SECRET);
      const user = await User.findById(decoded.id);
      if (!user) {
        return res.status(401).json({ success: false, message: 'User no longer exists' });
      }
      req.user = user;
      return next();
    } catch (err) {
      // Access token expired or invalid — fall through to refresh token
      if (err.name !== 'TokenExpiredError' && err.name !== 'JsonWebTokenError') {
        return res.status(401).json({ success: false, message: 'Authentication error' });
      }
    }
  }

  // ── Try refresh token ────────────────────────────────────────────────────
  if (!refreshToken) {
    return res.status(401).json({ success: false, message: 'Session expired. Please log in again.' });
  }

  let decoded;
  try {
    decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid session. Please log in again.' });
  }

  const storedToken = await Token.findOne({
    token: refreshToken,
    user: decoded.id,
  });

  if (!storedToken) {
    return res
      .status(401)
      .json({ success: false, message: 'Session not found. Please log in again.' });
  }

  const user = await User.findById(decoded.id);
  if (!user) {
    await Token.deleteOne({ _id: storedToken._id });
    return res.status(401).json({ success: false, message: 'User no longer exists' });
  }

  // Rotate tokens (delete old, issue new)
  await Token.deleteOne({ _id: storedToken._id });
  const { accessToken: newAccess, refreshToken: newRefresh } = await generateTokens(user._id);
  setTokenCookies(res, newAccess, newRefresh);

  req.user = user;
  return next();
};