const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const supabase = require('../config/supabase');

const generateTokens = (user) => {
  const accessToken = jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
  );
  const refreshToken = jwt.sign(
    { id: user.id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
  return { accessToken, refreshToken };
};

const setCookies = (res, accessToken, refreshToken) => {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('accessToken', accessToken, {
    httpOnly: true, secure: isProd,
    sameSite: isProd ? 'strict' : 'lax',
    maxAge: 15 * 60 * 1000,
  });
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true, secure: isProd,
    sameSite: isProd ? 'strict' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

const register = async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    name: z.string().min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.errors } });

  const { email, password, name } = parsed.data;
  try {
    const { data: existing } = await supabase
      .from('users').select('id').eq('email', email).single();
    if (existing)
      return res.status(409).json({ error: { code: 'CONFLICT', message: 'Email already registered' } });

    const passwordHash = await bcrypt.hash(password, 12);
    const { data: user, error } = await supabase
      .from('users')
      .insert({ email, name, password_hash: passwordHash })
      .select('id, email, name, created_at')
      .single();

    if (error) throw error;
    const { accessToken, refreshToken } = generateTokens(user);
    setCookies(res, accessToken, refreshToken);
    return res.status(201).json({ user, accessToken });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Registration failed' } });
  }
};

const login = async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.errors } });

  const { email, password } = parsed.data;
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, name, password_hash, created_at')
      .eq('email', email).single();

    if (error || !user)
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid)
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } });

    const { accessToken, refreshToken } = generateTokens(user);
    setCookies(res, accessToken, refreshToken);
    const { password_hash, ...safeUser } = user;
    return res.json({ user: safeUser, accessToken });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Login failed' } });
  }
};

const logout = (req, res) => {
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');
  return res.json({ message: 'Logged out successfully' });
};

const refresh = async (req, res) => {
  const token = req.cookies?.refreshToken;
  if (!token)
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'No refresh token' } });
  try {
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    const { data: user } = await supabase
      .from('users').select('id, email, name').eq('id', decoded.id).single();
    if (!user)
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'User not found' } });
    const { accessToken, refreshToken } = generateTokens(user);
    setCookies(res, accessToken, refreshToken);
    return res.json({ accessToken });
  } catch {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid refresh token' } });
  }
};

const me = async (req, res) => {
  try {
    const { data: user } = await supabase
      .from('users')
      .select('id, email, name, image_url, created_at')
      .eq('id', req.user.id).single();
    return res.json({ user });
  } catch {
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to fetch user' } });
  }
};

module.exports = { register, login, logout, refresh, me };