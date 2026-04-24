process.env.DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5432/auth_starter_test';
process.env.JWT_SECRET = 'test-secret-minimum-32-characters';
process.env.JWT_ACCESS_TOKEN_EXPIRY = '15m';
process.env.JWT_REFRESH_TOKEN_EXPIRY = '7d';
