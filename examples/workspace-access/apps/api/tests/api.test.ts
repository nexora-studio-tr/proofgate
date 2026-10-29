import {test,expect} from 'vitest';
import {request} from '../src/api.ts';
test('admin allowed',()=>expect(request('admin')).toBe(true));
