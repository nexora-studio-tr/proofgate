import {test,expect} from 'vitest';
import {mayRecord} from '../src/audit.ts';
test('admin allowed',()=>expect(mayRecord('admin')).toBe(true));
