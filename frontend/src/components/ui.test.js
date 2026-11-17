import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Button } from './ui.jsx';

const html = (props) => renderToStaticMarkup(createElement(Button, props, 'Gửi'));

describe('Button', () => {
  it('đang xử lý thì luôn khóa, kể cả khi disabled={false}', () => {
    expect(html({ loading: true, disabled: false })).toContain('disabled');
    expect(html({ loading: true })).toContain('aria-busy="true"');
  });
  it('khóa theo điều kiện khi không xử lý', () => {
    expect(html({ disabled: true })).toContain('disabled');
    expect(html({ disabled: false })).not.toContain('disabled');
  });
});
