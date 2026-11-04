import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { AREAS } from '../services/mock/seed.js';
import { OLD_WARDS, oldWardText, wardLabel } from './wards.js';

describe('Phường mới và địa bàn cũ', () => {
  it('đủ 15 phường phục vụ, khớp danh sách của backend', () => {
    const backend = readFileSync(new URL('../../../backend/app/domain/areas.py', import.meta.url), 'utf8');
    const backendWards = [...backend.matchAll(/^\s+"([^"]+)",$/gm)].map((m) => m[1]);
    expect(Object.keys(OLD_WARDS).sort()).toEqual([...AREAS].sort());
    expect(backendWards.sort()).toEqual([...AREAS].sort());
  });
  it('ghi rõ phường và quận cũ', () => {
    expect(oldWardText('Xuân Hòa')).toBe('P. Võ Thị Sáu, P. 4, Quận 3');
    expect(oldWardText('Bình Quới')).toBe('P. 27, P. 28, Quận Bình Thạnh');
    expect(wardLabel('Bến Thành')).toBe('Bến Thành (Quận 1 cũ)');
    expect([oldWardText('Phường khác'), wardLabel('Phường khác')]).toEqual(['', 'Phường khác']);
  });
});
