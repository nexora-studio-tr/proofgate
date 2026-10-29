import {test,expect} from 'vitest';
import {canEdit} from '../src/access.ts';
test('admin allowed',()=>expect(canEdit('admin')).toBe(true));
