import { test, expect } from 'vitest';
import { canDelete } from '../src/access.ts';
test('allows owner',()=>expect(canDelete('owner')).toBe(true));
test('rejects viewer',()=>expect(canDelete('viewer')).toBe(false));
test('rejects member',()=>expect(canDelete('member')).toBe(false));
test('allows admin',()=>expect(canDelete('admin')).toBe(true));
