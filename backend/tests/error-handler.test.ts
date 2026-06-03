import { test } from 'node:test';
import assert from 'node:assert/strict';
import { errorHandler, AppError } from '../src/shared/middleware/error-handler';

function mockReqRes() {
  const req: any = { method: 'POST', originalUrl: '/api/v1/auth/login', headers: {}, ip: '1.2.3.4', body: { email: 'teste@x.com' } };
  const res: any = {
    statusCode: 0,
    body: null,
    status(c: number) { this.statusCode = c; return this; },
    json(b: any) { this.body = b; return this; },
  };
  return { req, res };
}

test('AppError passa o status e código (ex.: 401 credenciais)', () => {
  const { req, res } = mockReqRes();
  errorHandler(new AppError(401, 'INVALID_CREDENTIALS', 'E-mail ou senha incorretos'), req, res, () => {});
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error.code, 'INVALID_CREDENTIALS');
});

test('erro de conexão do banco -> 503 SERVICE_UNAVAILABLE com errorId', () => {
  const { req, res } = mockReqRes();
  const e: any = new Error('Timed out fetching a new connection from the connection pool');
  e.code = 'P2024';
  errorHandler(e, req, res, () => {});
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error.code, 'SERVICE_UNAVAILABLE');
  assert.ok(res.body.error.errorId, 'deve ter errorId para correlacionar com o log');
});

test('banco indisponível (init error) -> 503', () => {
  const { req, res } = mockReqRes();
  const e = new Error("Can't reach database server");
  e.name = 'PrismaClientInitializationError';
  errorHandler(e, req, res, () => {});
  assert.equal(res.statusCode, 503);
});

test('falha de JWT (erro genérico) -> 500 com errorId, mensagem genérica ao cliente', () => {
  const { req, res } = mockReqRes();
  errorHandler(new Error('secretOrPrivateKey must have a value'), req, res, () => {});
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.error.code, 'INTERNAL_ERROR');
  assert.equal(res.body.error.message, 'Erro interno do servidor');
  assert.ok(res.body.error.errorId);
});
