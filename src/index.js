const allowedOrigins = [
  'https://clouddrive-frontend-ten.vercel.app',
  'https://clouddrive-frontend-sunnynagar3134-gmailcoms-projects.vercel.app',
  /https:\/\/clouddrive-frontend.*\.vercel\.app/,
  'http://localhost:3000',
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    const allowed = allowedOrigins.some(o =>
      typeof o === 'string' ? o === origin : o.test(origin)
    );
    if (allowed) {
      callback(null, true);
    } else {
      callback(null, true); // Allow all for now
    }
  },
  credentials: true,
}));