const { z } = require('zod');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const supabase = require('../config/supabase');

const createShare = async (req, res) => {
  const schema = z.object({
    resourceType: z.enum(['file', 'folder']),
    resourceId: z.string().uuid(),
    granteeUserId: z.string().uuid(),
    role: z.enum(['viewer', 'editor']),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.errors } });
  const { resourceType, resourceId, granteeUserId, role } = parsed.data;
  const userId = req.user.id;
  if (granteeUserId === userId)
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Cannot share with yourself' } });
  try {
    const table = resourceType === 'file' ? 'files' : 'folders';
    const { data: resource } = await supabase.from(table).select('owner_id').eq('id', resourceId).single();
    if (!resource || resource.owner_id !== userId)
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'You do not own this resource' } });
    const { data: share, error } = await supabase.from('shares')
      .upsert({ resource_type: resourceType, resource_id: resourceId, grantee_user_id: granteeUserId, role, created_by: userId },
        { onConflict: 'resource_type,resource_id,grantee_user_id' })
      .select().single();
    if (error) throw error;
    return res.status(201).json({ share });
  } catch (err) {
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to create share' } });
  }
};

const listShares = async (req, res) => {
  const { resourceType, resourceId } = req.params;
  try {
    const { data: shares, error } = await supabase.from('shares')
      .select('*, grantee:users!grantee_user_id(id, email, name)')
      .eq('resource_type', resourceType).eq('resource_id', resourceId);
    if (error) throw error;
    return res.json({ shares });
  } catch (err) {
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to fetch shares' } });
  }
};

const deleteShare = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  try {
    await supabase.from('shares').delete().eq('id', id).eq('created_by', userId);
    return res.json({ message: 'Share revoked' });
  } catch (err) {
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to delete share' } });
  }
};

const createLinkShare = async (req, res) => {
  const schema = z.object({
    resourceType: z.enum(['file', 'folder']),
    resourceId: z.string().uuid(),
    expiresAt: z.string().datetime().optional(),
    password: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.errors } });
  const { resourceType, resourceId, expiresAt, password } = parsed.data;
  const userId = req.user.id;
  try {
    const token = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '');
    const passwordHash = password ? await bcrypt.hash(password, 10) : null;
    const { data: link, error } = await supabase.from('link_shares')
      .insert({ resource_type: resourceType, resource_id: resourceId, token, password_hash: passwordHash, expires_at: expiresAt || null, created_by: userId })
      .select().single();
    if (error) throw error;
    return res.status(201).json({ link: { ...link, password_hash: undefined }, shareUrl: `/share/${token}` });
  } catch (err) {
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to create link' } });
  }
};

const resolveLinkShare = async (req, res) => {
  const { token } = req.params;
  const { password } = req.query;
  try {
    const { data: link, error } = await supabase.from('link_shares').select('*').eq('token', token).single();
    if (error || !link)
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Link not found' } });
    if (link.expires_at && new Date(link.expires_at) < new Date())
      return res.status(410).json({ error: { code: 'EXPIRED', message: 'Link has expired' } });
    if (link.password_hash) {
      if (!password)
        return res.status(401).json({ error: { code: 'PASSWORD_REQUIRED', message: 'Password required' } });
      const valid = await bcrypt.compare(password, link.password_hash);
      if (!valid)
        return res.status(401).json({ error: { code: 'WRONG_PASSWORD', message: 'Incorrect password' } });
    }
    const table = link.resource_type === 'file' ? 'files' : 'folders';
    const { data: resource } = await supabase.from(table).select('*').eq('id', link.resource_id).single();
    return res.json({ link: { ...link, password_hash: undefined }, resource });
  } catch (err) {
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to resolve link' } });
  }
};

const deleteLinkShare = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  try {
    await supabase.from('link_shares').delete().eq('id', id).eq('created_by', userId);
    return res.json({ message: 'Link deleted' });
  } catch {
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to delete link' } });
  }
};

module.exports = { createShare, listShares, deleteShare, createLinkShare, resolveLinkShare, deleteLinkShare };