import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseAllowedOrigins } from './origins.ts';

test('parses a single origin exactly as the old strict check did', () => {
  assert.deepEqual(
    parseAllowedOrigins('APP_WEB_ORIGIN', 'https://creatordna-app.vercel.app'),
    ['https://creatordna-app.vercel.app'],
  );
});

test('parses a comma-separated list, trimming whitespace', () => {
  assert.deepEqual(
    parseAllowedOrigins(
      'APP_WEB_ORIGIN',
      'https://www.creatordna.in, https://creatordna-app.vercel.app ,http://localhost:8081',
    ),
    [
      'https://www.creatordna.in',
      'https://creatordna-app.vercel.app',
      'http://localhost:8081',
    ],
  );
});

test('tolerates a trailing slash and dedupes repeated origins', () => {
  assert.deepEqual(
    parseAllowedOrigins(
      'APP_WEB_ORIGIN',
      'https://www.creatordna.in/, https://www.creatordna.in',
    ),
    ['https://www.creatordna.in'],
  );
});

test('rejects a value with no usable origin', () => {
  assert.throws(
    () => parseAllowedOrigins('APP_WEB_ORIGIN', '   '),
    /APP_WEB_ORIGIN must contain at least one origin/,
  );
  assert.throws(
    () => parseAllowedOrigins('APP_WEB_ORIGIN', ' ,  ,'),
    /APP_WEB_ORIGIN must contain at least one origin/,
  );
});

test('rejects entries that are not bare origins', () => {
  const invalidEntries = [
    'https://www.creatordna.in/app',
    'https://www.creatordna.in?from=app',
    'https://www.creatordna.in#section',
    'https://user:pass@www.creatordna.in',
    'http://www.creatordna.in',
    'ftp://creatordna.in',
    'javascript:alert(1)',
    'not-a-url',
  ];
  for (const entry of invalidEntries) {
    assert.throws(
      () => parseAllowedOrigins('APP_WEB_ORIGIN', entry),
      (error) =>
        error instanceof Error &&
        error.message.includes('APP_WEB_ORIGIN must be a comma-separated list'),
      `should reject ${JSON.stringify(entry)}`,
    );
  }
});

test('rejects a list when any single entry is invalid', () => {
  assert.throws(
    () =>
      parseAllowedOrigins(
        'AI_WEB_ORIGIN',
        'https://www.creatordna.in, https://www.creatordna.in/extra',
      ),
    /AI_WEB_ORIGIN must be a comma-separated list/,
  );
});

test('allows http://localhost with a port for development', () => {
  assert.deepEqual(
    parseAllowedOrigins('APP_WEB_ORIGIN', 'http://localhost:8081'),
    ['http://localhost:8081'],
  );
});
