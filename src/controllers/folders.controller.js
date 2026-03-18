const { z } = require('zod');
const supabase = require('../config/supabase');

const createFolder = async (req, res) => {
  const schema = z.object({
    name: z.string().min(1).max(255),
    parentId: z.string().uuid().nullable().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.errors } });

  const { name, parentId } = parsed.data;
  const userId = req.user.id;
  try {
    if (parentId) {
      const { data: parent } = await supabase
        .from('folders').select('id').eq('id', parentId).eq('owner_id', userId).single();
      if (!parent)
        return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Parent folder not found' } });
    }
    const { data: folder, error } = await supabase
      .from('folders')
      .insert({ name, owner_id: userId, parent_id: parentId || null })
      .select().single();
    if (error) {
      if (error.code === '23505')
        return res.status(409).json({ error: { code: 'CONFLICT', message: 'Folder name already exists' } });
      throw error;
    }
    return res.status(201).json({ folder });
  } catch (err) {
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to create folder' } });
  }
};

const getFolder = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  try {
    let folder = null;
    let path = [];
    if (id !== 'root') {
      const { data, error } = await supabase
        .from('folders').select('*').eq('id', id).eq('is_deleted', false).single();
      if (error || !data)
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Folder not found' } });
      if (data.owner_id !== userId) {
        const { data: share } = await supabase.from('shares').select('role')
          .eq('resource_type', 'folder').eq('resource_id', id)
          .eq('grantee_user_id', userId).single();
        if (!share)
          return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
      }
      folder = data;
      const { data: pathData } = await supabase.rpc('get_folder_path', { folder_id: id });
      path = pathData || [];
    }
    const foldersQuery = supabase.from('folders').select('*')
      .eq('owner_id', userId).eq('is_deleted', false).order('name');
    id === 'root' ? foldersQuery.is('parent_id', null) : foldersQuery.eq('parent_id', id);
    const { data: folders } = await foldersQuery;

    const filesQuery = supabase.from('files')
      .select('id, name, mime_type, size_bytes, created_at, updated_at, folder_id, owner_id')
      .eq('owner_id', userId).eq('is_deleted', false).eq('status', 'ready').order('name');
    id === 'root' ? filesQuery.is('folder_id', null) : filesQuery.eq('folder_id', id);
    const { data: files } = await filesQuery;

    return res.json({ folder, children: { folders: folders || [], files: files || [] }, path });
  } catch (err) {
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to fetch folder' } });
  }
};

const updateFolder = async (req, res) => {
  const schema = z.object({
    name: z.string().min(1).max(255).optional(),
    parentId: z.string().uuid().nullable().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.errors } });
  const { id } = req.params;
  const userId = req.user.id;
  const updates = { updated_at: new Date().toISOString() };
  if (parsed.data.name) updates.name = parsed.data.name;
  if (parsed.data.parentId !== undefined) updates.parent_id = parsed.data.parentId;
  try {
    const { data, error } = await supabase.from('folders').update(updates)
      .eq('id', id).eq('owner_id', userId).select().single();
    if (!data)
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Folder not found' } });
    if (error) throw error;
    return res.json({ folder: data });
  } catch (err) {
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to update folder' } });
  }
};

const deleteFolder = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  try {
    await supabase.from('folders')
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq('id', id).eq('owner_id', userId);
    return res.json({ message: 'Folder moved to trash' });
  } catch (err) {
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to delete folder' } });
  }
};

module.exports = { createFolder, getFolder, updateFolder, deleteFolder };