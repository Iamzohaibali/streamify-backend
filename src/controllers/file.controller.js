import { File } from '../models/file.model.js';
import { User } from '../models/user.model.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { cloudinary, uploadToCloudinary } from '../config/cloudinary.js';

// ── Upload files ──────────────────────────────────────────────────────────────
export const uploadFiles = async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return ApiResponse.error(res, 'No files uploaded', 400);
  }

  // Always recalculate actual storageUsed from DB to avoid drift
  const actualUsed = await File.aggregate([
    { $match: { owner: req.user._id } },
    { $group: { _id: null, total: { $sum: '$size' } } },
  ]);
  const currentUsed = actualUsed[0]?.total ?? 0;

  // Ensure storageLimit is always 5MB (fix corrupted/missing values)
  const STORAGE_LIMIT = 5 * 1024 * 1024;

  const totalUploadSize = req.files.reduce((sum, f) => sum + f.size, 0);
  const remaining = STORAGE_LIMIT - currentUsed;

  if (remaining <= 0) {
    return ApiResponse.error(res, 'Storage full. Please delete some files to free up space.', 400);
  }

  if (totalUploadSize > remaining) {
    const remainingMB = (remaining / 1024 / 1024).toFixed(2);
    const uploadMB    = (totalUploadSize / 1024 / 1024).toFixed(2);
    return ApiResponse.error(
      res,
      `Not enough storage. Trying to upload ${uploadMB} MB but only ${remainingMB} MB remaining.`,
      400
    );
  }

  // Upload each file buffer to Cloudinary
  const uploadResults = await Promise.all(
    req.files.map((file) =>
      uploadToCloudinary(file.buffer, `streamify/${req.user._id}`, file.mimetype)
        .then((result) => ({ file, result }))
    )
  );

  const fileDocs = uploadResults.map(({ file, result }) => ({
    owner: req.user._id,
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    cloudinary: {
      url: result.url,
      publicId: result.publicId,
      format: file.mimetype.split('/')[1],
    },
  }));

  const savedFiles = await File.insertMany(fileDocs);

  // Recalculate total from DB after insert (most accurate)
  const newUsedAgg = await File.aggregate([
    { $match: { owner: req.user._id } },
    { $group: { _id: null, total: { $sum: '$size' } } },
  ]);
  const newUsed = newUsedAgg[0]?.total ?? 0;

  // Update user with accurate value + ensure limit is correct
  await User.findByIdAndUpdate(req.user._id, {
    storageUsed: newUsed,
    storageLimit: STORAGE_LIMIT,
  });

  return ApiResponse.success(
    res,
    {
      files: savedFiles,
      storageUsed: newUsed,
      storageLimit: STORAGE_LIMIT,
    },
    `${savedFiles.length} file(s) uploaded successfully`,
    201
  );
};

// ── Get user's files ──────────────────────────────────────────────────────────
export const getUserFiles = async (req, res) => {
  const page  = Math.max(parseInt(req.query.page)  || 1, 1);
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const skip  = (page - 1) * limit;

  const [files, total] = await Promise.all([
    File.find({ owner: req.user._id }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    File.countDocuments({ owner: req.user._id }),
  ]);

  return ApiResponse.success(res, {
    files,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
};

// ── Delete single file ────────────────────────────────────────────────────────
export const deleteFile = async (req, res) => {
  try {
    const file = await File.findOne({ _id: req.params.id, owner: req.user._id });
    if (!file) return ApiResponse.error(res, 'File not found', 404);

    // Cloudinary is already configured in server.js, so just delete
    await cloudinary.uploader.destroy(file.cloudinary.publicId);
    await File.deleteOne({ _id: file._id });

    // Recalculate from DB for accuracy
    const STORAGE_LIMIT = 5 * 1024 * 1024;
    const agg = await File.aggregate([
      { $match: { owner: req.user._id } },
      { $group: { _id: null, total: { $sum: '$size' } } },
    ]);
    const newUsed = agg[0]?.total ?? 0;
    await User.findByIdAndUpdate(req.user._id, {
      storageUsed: newUsed,
      storageLimit: STORAGE_LIMIT,
    });

    return ApiResponse.success(res, { storageUsed: newUsed, storageLimit: STORAGE_LIMIT }, 'File deleted successfully');
  } catch (error) {
    console.error('Delete error:', error);
    return ApiResponse.error(res, error.message || 'Failed to delete file', 500);
  }
};

// ── Bulk delete ───────────────────────────────────────────────────────────────
export const deleteMultipleFiles = async (req, res) => {
  try {
    const { fileIds } = req.body;

    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      return ApiResponse.error(res, 'No file IDs provided', 400);
    }
    if (fileIds.length > 50) {
      return ApiResponse.error(res, 'Cannot delete more than 50 files at once', 400);
    }

    const files = await File.find({ _id: { $in: fileIds }, owner: req.user._id });
    if (!files.length) return ApiResponse.error(res, 'No matching files found', 404);

    // Cloudinary is already configured in server.js, so just delete
    await Promise.allSettled(files.map((f) => cloudinary.uploader.destroy(f.cloudinary.publicId)));
    await File.deleteMany({ _id: { $in: files.map((f) => f._id) } });

    // Recalculate from DB
    const STORAGE_LIMIT = 5 * 1024 * 1024;
    const agg = await File.aggregate([
      { $match: { owner: req.user._id } },
      { $group: { _id: null, total: { $sum: '$size' } } },
    ]);
    const newUsed = agg[0]?.total ?? 0;
    await User.findByIdAndUpdate(req.user._id, {
      storageUsed: newUsed,
      storageLimit: STORAGE_LIMIT,
    });

    return ApiResponse.success(
      res,
      { storageUsed: newUsed, storageLimit: STORAGE_LIMIT },
      `${files.length} file(s) deleted successfully`
    );
  } catch (error) {
    console.error('Bulk delete error:', error);
    return ApiResponse.error(res, error.message || 'Failed to delete files', 500);
  }
};

// ── Recalculate storage (repair endpoint) ─────────────────────────────────────
export const recalcStorage = async (req, res) => {
  const STORAGE_LIMIT = 5 * 1024 * 1024;
  const agg = await File.aggregate([
    { $match: { owner: req.user._id } },
    { $group: { _id: null, total: { $sum: '$size' } } },
  ]);
  const newUsed = agg[0]?.total ?? 0;
  const user = await User.findByIdAndUpdate(
    req.user._id,
    { storageUsed: newUsed, storageLimit: STORAGE_LIMIT },
    { new: true }
  );
  return ApiResponse.success(res, { user, storageUsed: newUsed, storageLimit: STORAGE_LIMIT }, 'Storage recalculated');
};