const supabase = require('../config/supabase');
const { z } = require('zod');

const search = async (req, res) => {
  const { q, type } = req.query;
  const userId = req.user.id;
  if (!q || q.trim().length < 1)
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Query required' } });
  try {
    const filesQuery = supabase.from('files')
      .select('id, name, mime_type, size_bytes, created_at, folder_id')
      .eq('owner_id', userId).eq('is_deleted', false).ilike('name', `%${q}%`).limit(20);
    const foldersQuery = supabase.from('folders')
      .select('id, name, created_at, parent_id')
      .eq('owner_id', userId).eq('is_deleted', false).ilike('name', `%${q}%`).limit(20);
    if (type === 'file') { const { data: files } = await filesQuery; return res.json({ results: { files: files || [], folders: [] } }); }
    if (type === 'folder') { const { data: folders } = await foldersQuery; return res.json({ results: { files: [], folders: folders || [] } }); }
    const [{ data: files }, { data: folders }] = await Promise.all([filesQuery, foldersQuery]);
    return res.json({ results: { files: files || [], folders: folders || [] } });
  } catch (err) {
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Search failed' } });
  }
};

const addStar = async (req, res) => {
  const schema = z.object({ resourceType: z.enum(['file', 'folder']), resourceId: z.string().uuid() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.errors } });
  const { resourceType, resourceId } = parsed.data;
  const userId = req.user.id;
  try {
    await supabase.from('stars').upsert({ user_id: userId, resource_type: resourceType, resource_id: resourceId }, { onConflict: 'user_id,resource_type,resource_id' });
    return res.json({ message: 'Starred' });
  } catch { return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to star' } }); }
};

const removeStar = async (req, res) => {
  const { resourceType, resourceId } = req.body;
  const userId = req.user.id;
  try {
    await supabase.from('stars').delete().eq('user_id', userId).eq('resource_type', resourceType).eq('resource_id', resourceId);
    return res.json({ message: 'Unstarred' });
  } catch { return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to unstar' } }); }
};

const getStars = async (req, res) => {
  const userId = req.user.id;
  try {
    const { data: stars } = await supabase.from('stars').select('*').eq('user_id', userId);
    const fileIds = stars?.filter(s => s.resource_type === 'file').map(s => s.resource_id) || [];
    const folderIds = stars?.filter(s => s.resource_type === 'folder').map(s => s.resource_id) || [];
    const [{ data: files }, { data: folders }] = await Promise.all([
      fileIds.length ? supabase.from('files').select('id,name,mime_type,size_bytes,created_at').in('id', fileIds) : Promise.resolve({ data: [] }),
      folderIds.length ? supabase.from('folders').select('id,name,created_at').in('id', folderIds) : Promise.resolve({ data: [] }),
    ]);
    return res.json({ starred: { files: files || [], folders: folders || [] } });
  } catch { return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to fetch stars' } }); }
};

const getTrash = async (req, res) => {
  const userId = req.user.id;
  try {
    const [{ data: files }, { data: folders }] = await Promise.all([
      supabase.from('files').select('id,name,mime_type,size_bytes,updated_at').eq('owner_id', userId).eq('is_deleted', true),
      supabase.from('folders').select('id,name,updated_at').eq('owner_id', userId).eq('is_deleted', true),
    ]);
    return res.json({ trash: { files: files || [], folders: folders || [] } });
  } catch { return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to fetch trash' } }); }
};

const restoreFromTrash = async (req, res) => {
  const schema = z.object({ resourceType: z.enum(['file', 'folder']), resourceId: z.string().uuid() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.errors } });
  const { resourceType, resourceId } = parsed.data;
  const userId = req.user.id;
  try {
    const table = resourceType === 'file' ? 'files' : 'folders';
    await supabase.from(table).update({ is_deleted: false, updated_at: new Date().toISOString() }).eq('id', resourceId).eq('owner_id', userId);
    return res.json({ message: 'Restored' });
  } catch { return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to restore' } }); }
};

const getRecent = async (req, res) => {
  const userId = req.user.id;
  try {
    const { data: files } = await supabase.from('files')
      .select('id,name,mime_type,size_bytes,created_at,folder_id')
      .eq('owner_id', userId).eq('is_deleted', false)
      .order('created_at', { ascending: false }).limit(20);
    return res.json({ recent: files || [] });
  } catch { return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to fetch recent' } }); }
};

module.exports = { search, addStar, removeStar, getStars, getTrash, restoreFromTrash, getRecent };