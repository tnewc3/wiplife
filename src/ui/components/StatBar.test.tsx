// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StatBar } from './StatBar';

afterEach(cleanup);

describe('StatBar', () => {
  it('shows a labeled bar without any numbers', () => {
    const { container } = render(<StatBar label="Health" value={72} />);
    expect(container.textContent).toBe('Health');
    expect(container.textContent).not.toMatch(/\d/);
    const meter = screen.getByRole('meter', { name: 'Health' });
    expect(meter.getAttribute('aria-valuetext')).toBe('high');
  });

  it('clamps values into 0–100', () => {
    render(<StatBar label="Stress" value={140} />);
    const fill = screen.getByRole('meter').firstElementChild as HTMLElement;
    expect(fill.style.width).toBe('100%');
  });
});
