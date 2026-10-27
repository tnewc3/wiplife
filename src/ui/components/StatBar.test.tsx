// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { barColor } from './barColor';
import { StatBar } from './StatBar';

afterEach(cleanup);

describe('StatBar', () => {
  it('shows a labeled bar with its percentage', () => {
    const { container } = render(<StatBar label="Health" value={72} />);
    expect(container.textContent).toBe('Health72%');
    const meter = screen.getByRole('meter', { name: 'Health' });
    expect(meter.getAttribute('aria-valuenow')).toBe('72');
    expect(meter.getAttribute('aria-valuetext')).toBe('72 percent, high');
  });

  it('shows the percentage in the one-line layout too', () => {
    const { container } = render(<StatBar label="Smarts" value={70} layout="row" />);
    expect(container.textContent).toBe('Smarts70%');
  });

  it('clamps values into 0–100', () => {
    render(<StatBar label="Stress" value={140} />);
    const fill = screen.getByRole('meter').firstElementChild as HTMLElement;
    expect(fill.style.width).toBe('100%');
    expect(screen.getByRole('meter').getAttribute('aria-valuenow')).toBe('100');
  });

  it('colors the fill by value: low red, middle amber, high green', () => {
    expect(barColor(10)).toBe('var(--wl-negative)');
    expect(barColor(50)).toBe('var(--wl-warning)');
    expect(barColor(90)).toBe('var(--wl-positive)');
  });

  it('turns the colors around when more is worse, and leaves personality plain', () => {
    expect(barColor(90, 'bad')).toBe('var(--wl-negative)');
    expect(barColor(10, 'bad')).toBe('var(--wl-positive)');
    expect(barColor(10, 'plain')).toBe('var(--wl-bar-fill)');
  });
});
