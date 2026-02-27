import { User } from '../models/user.model.js';
import { Token } from '../models/token.model.js';
import { File } from '../models/file.model.js';
import { generateTokens, setTokenCookies } from '../utils/generateTokens.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { cloudinary, uploadToCloudinary } from '../config/cloudinary.js';

// ── Register ──────────────────────────────────────────────────────────────────
export const register = async (req, res) => {
  const { username, email, password } = req.body;

  if (!username?.trim() || !email?.trim() || !password) {
    return ApiResponse.error(res, 'All fields are required', 400);
  }
  if (username.trim().length < 3) {
    return ApiResponse.error(res, 'Username must be at least 3 characters', 400);
  }
  if (password.length < 6) {
    return ApiResponse.error(res, 'Password must be at least 6 characters', 400);
  }

  const existingEmail = await User.findOne({ email: email.trim().toLowerCase() });
  if (existingEmail) return ApiResponse.error(res, 'Email is already registered', 409);

  const existingUsername = await User.findOne({ username: username.trim() });
  if (existingUsername) return ApiResponse.error(res, 'Username is already taken', 409);

  const user = await User.create({
    username: username.trim(),
    email: email.trim().toLowerCase(),
    password,
  });

  const { accessToken, refreshToken } = await generateTokens(user._id);
  setTokenCookies(res, accessToken, refreshToken);

  return ApiResponse.success(res, { user: user.toJSON() }, 'Account created successfully', 201);
};

// ── Login ─────────────────────────────────────────────────────────────────────
export const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email?.trim() || !password) {
    return ApiResponse.error(res, 'Email and password are required', 400);
  }

  const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    return ApiResponse.error(res, 'Invalid email or password', 401);
  }

  const { accessToken, refreshToken } = await generateTokens(user._id);
  setTokenCookies(res, accessToken, refreshToken);

  return ApiResponse.success(res, { user: user.toJSON() }, 'Logged in successfully');
};

// ── Logout ────────────────────────────────────────────────────────────────────
export const logout = async (req, res) => {
  const refreshToken = req.cookies?.refreshToken;
  if (refreshToken) await Token.deleteOne({ token: refreshToken });
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');
  return ApiResponse.success(res, null, 'Logged out successfully');
};

// ── Get current user ──────────────────────────────────────────────────────────
export const getMe = async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) return ApiResponse.error(res, 'User not found', 404);
  return ApiResponse.success(res, { user }, 'User fetched');
};

// ── Update profile ────────────────────────────────────────────────────────────
export const updateProfile = async (req, res) => {
  const { username } = req.body;
  const updates = {};

  if (username?.trim()) {
    if (username.trim().length < 3) {
      return ApiResponse.error(res, 'Username must be at least 3 characters', 400);
    }
    const exists = await User.findOne({
      username: username.trim(),
      _id: { $ne: req.user._id },
    });
    if (exists) return ApiResponse.error(res, 'Username is already taken', 409);
    updates.username = username.trim();
  }

  // Avatar upload — req.file.buffer comes from memoryStorage
  if (req.file) {
    // Delete old avatar from Cloudinary
    if (req.user.avatar?.publicId) {
      try {
        await cloudinary.uploader.destroy(req.user.avatar.publicId);
      } catch { /* non-fatal */ }
    }
    const { url, publicId } = await uploadToCloudinary(
      req.file.buffer,
      `streamify/${req.user._id}/avatar`,
      req.file.mimetype
    );
    updates.avatar = { url, publicId };
  }

  if (Object.keys(updates).length === 0) {
    return ApiResponse.error(res, 'No changes provided', 400);
  }

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $set: updates },
    { new: true, runValidators: true }
  );

  return ApiResponse.success(res, { user }, 'Profile updated');
};

// ── Change password ───────────────────────────────────────────────────────────
export const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return ApiResponse.error(res, 'Both current and new passwords are required', 400);
  }
  if (newPassword.length < 6) {
    return ApiResponse.error(res, 'New password must be at least 6 characters', 400);
  }
  if (currentPassword === newPassword) {
    return ApiResponse.error(res, 'New password must be different', 400);
  }

  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.comparePassword(currentPassword))) {
    return ApiResponse.error(res, 'Current password is incorrect', 401);
  }

  user.password = newPassword;
  await user.save();

  await Token.deleteMany({ user: req.user._id });
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');

  return ApiResponse.success(res, null, 'Password changed. Please log in again.');
};

// ── Delete account ────────────────────────────────────────────────────────────
export const deleteAccount = async (req, res) => {
  const userId = req.user._id;

  const files = await File.find({ owner: userId });
  await Promise.allSettled(files.map((f) => cloudinary.uploader.destroy(f.cloudinary.publicId)));
  await File.deleteMany({ owner: userId });

  if (req.user.avatar?.publicId) {
    try { await cloudinary.uploader.destroy(req.user.avatar.publicId); } catch { /* non-fatal */ }
  }

  await Token.deleteMany({ user: userId });
  await User.findByIdAndDelete(userId);

  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');

  return ApiResponse.success(res, null, 'Account deleted successfully');
};