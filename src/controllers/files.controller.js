const { z } = require('zod');
const { v4: uuidv4 } = require('uuid');
const supabase = require('../config/supabase');

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'drive-files';
const SIGNED_URL_EXPIRES = 3600;

const initUpload = async (req, res) => {
  const schema = z.object({
    name: z.string().min(1).max(500),
    mimeType: z.string(),
    sizeBytes: z.number().positive(),
    folderId: z.string().uuid().nullable().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.errors } });

  const { name, mimeType, sizeBytes, folderId } = parsed.data;
  const userId = req.user.id;
  const safeName = name.replace(/[^a-zA-Z0-9.\-_ ]/g, '_');
  const fileId = uuidv4();
  const storageKey = `${userId}/${folderId || 'root'}/${fileId}-${safeName}`;

  try {
    const { data: file, error } = await supabase.from('files').insert({
      id: fileId, name: safeName, mime_type: mimeType,
      size_bytes: sizeBytes, storage_key: storageKey,
      owner_id: userId, folder_id: folderId || null, status: 'uploading',
    }).select().single();
    if (error) throw error;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(BUCKET).createSignedUploadUrl(storageKey);
    if (uploadError) throw uploadError;

    return res.status(201).json({
      fileId, storageKey,
      uploadUrl: uploadData.signedUrl,
      token: uploadData.token,
    });
  } catch (err) {
    console.error('Init upload error:', err);
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to initiate upload' } });
  }
};

const completeUpload = async (req, res) => {
  const schema = z.object({ fileId: z.string().uuid() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.errors } });
  const { fileId } = parsed.data;
  const userId = req.user.id;
  try {
    const { data: file, error } = await supabase.from('files')
      .update({ status: 'ready', updated_at: new Date().toISOString() })
      .eq('id', fileId).eq('owner_id', userId).select().single();
    if (!file)
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'File not found' } });
    if (error) throw error;
    return res.json({ file });
  } catch (err) {
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to complete upload' } });
  }
};

const getFile = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  try {
    const { data: file, error } = await supabase.from('files')
      .select('*').eq('id', id).eq('is_deleted', false).single();
    if (error || !file)
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'File not found' } });
    if (file.owner_id !== userId) {
      const { data: share } = await supabase.from('shares').select('role')
        .eq('resource_type', 'file').eq('resource_id', id)
        .eq('grantee_user_id', userId).single();
      if (!share)
        return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }
    const { data: urlData, error: urlErr } = await supabase.storage
      .from(BUCKET).createSignedUrl(file.storage_key, SIGNED_URL_EXPIRES);
    if (urlErr) throw urlErr;
    return res.json({ file, signedUrl: urlData.signedUrl });
  } catch (err) {
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to fetch file' } });
  }
};

const updateFile = async (req, res) => {
  const schema = z.object({
    name: z.string().min(1).max(500).optional(),
    folderId: z.string().uuid().nullable().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.errors } });
  const { id } = req.params;
  const userId = req.user.id;
  const updates = { updated_at: new Date().toISOString() };
  if (parsed.data.name) updates.name = parsed.data.name;
  if (parsed.data.folderId !== undefined) updates.folder_id = parsed.data.folderId;
  try {
    const { data, error } = await supabase.from('files').update(updates)
      .eq('id', id).eq('owner_id', userId).select().single();
    if (!data)
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'File not found' } });
    if (error) throw error;
    return res.json({ file: data });
  } catch (err) {
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to update file' } });
  }
};

const deleteFile = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  try {
    await supabase.from('files')
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq('id', id).eq('owner_id', userId);
    return res.json({ message: 'File moved to trash' });
  } catch (err) {
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to delete file' } });
  }
};

module.exports = { initUpload, completeUpload, getFile, updateFile, deleteFile };