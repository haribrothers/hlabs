// US-USE-05 · Use the charts with a keyboard and screen reader (the chart components).
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { downsample, DOWNSAMPLE_TO, seriesDash } from '../src/charts/shared';
import { LineChart, Sparkline, StackedBar, StackedColumns } from '../src/index';

const status = () => screen.getByRole('status');

describe('US-USE-05', () => {
  it('Left/Right step one point and announce it ("16:32, CPU 46%"); Home and End jump to the ends', async () => {
    render(
      <LineChart
        title="CPU over the last hour"
        unit="%"
        labels={['16:30', '16:31', '16:32']}
        series={[{ name: 'CPU', values: [10, 20, 46] }]}
      />,
    );
    screen.getByRole('img', { name: /^CPU over the last hour\./ }).focus();
    await userEvent.keyboard('{End}');
    expect(status()).toHaveTextContent('16:32, CPU 46%');
    expect(document.querySelector('.hl-chart-tip')).toHaveTextContent('16:32');
    await userEvent.keyboard('{ArrowLeft}');
    expect(status()).toHaveTextContent('16:31, CPU 20%');
    await userEvent.keyboard('{Home}');
    expect(status()).toHaveTextContent('16:30, CPU 10%');
    await userEvent.keyboard('{ArrowLeft}');
    expect(status()).toHaveTextContent('16:30, CPU 10%');
  });

  it('Up/Down move between the series within one column of stacked columns', async () => {
    render(
      <StackedColumns
        title="Memory"
        labels={['16:31', '16:32']}
        formatValue={(v) => `${v} GB`}
        series={[
          { name: 'Immich', values: [2, 2] },
          { name: 'Jellyfin', values: [1, 1] },
          { name: 'Other', values: [5, 6] },
        ]}
      />,
    );
    screen.getByRole('img', { name: /up and down to move between parts/ }).focus();
    await userEvent.keyboard('{End}');
    expect(status()).toHaveTextContent('16:32, Immich 2 GB, Jellyfin 1 GB, Other 6 GB');
    await userEvent.keyboard('{ArrowUp}');
    expect(status()).toHaveTextContent('16:32, Immich 2 GB');
    await userEvent.keyboard('{ArrowUp}');
    expect(status()).toHaveTextContent('16:32, Jellyfin 1 GB');
    expect(document.querySelector('rect[data-focused]')).not.toBeNull();
    await userEvent.keyboard('{ArrowLeft}');
    expect(status()).toHaveTextContent('16:31, Jellyfin 1 GB');
    await userEvent.keyboard('{ArrowDown}');
    expect(status()).toHaveTextContent('16:31, Immich 2 GB');
  });

  it('a hidden table with the same values (time plus one column per series) is linked with aria-describedby', () => {
    render(
      <LineChart
        title="Network"
        labels={['16:31', '16:32']}
        series={[
          { name: 'In', values: [1, 2] },
          { name: 'Out', values: [3, 4] },
        ]}
      />,
    );
    const plot = screen.getByRole('img', { name: /^Network\./ });
    const table = document.getElementById(plot.getAttribute('aria-describedby')!)!;
    expect(table.tagName).toBe('TABLE');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((c) => c.textContent),
    ).toEqual(['Time', 'In', 'Out']);
    expect(within(table).getAllByRole('row')).toHaveLength(3);
  });

  it('a one-bar chart can be stepped through too, and its table is linked', async () => {
    render(
      <StackedBar
        title="Storage by use"
        unit="GB"
        total={100}
        segments={[
          { label: 'Apps', value: 10 },
          { label: 'System', value: 30 },
        ]}
      />,
    );
    const bar = screen.getByRole('img', { name: /^Storage by use\./ });
    expect(document.getElementById(bar.getAttribute('aria-describedby')!)).toHaveTextContent('Free60 GB');
    bar.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(status()).toHaveTextContent('Apps 10 GB');
    await userEvent.keyboard('{End}');
    expect(status()).toHaveTextContent('Free 60 GB');
  });

  it('a Sparkline that is not decorative has its table too', () => {
    render(<Sparkline values={[1, 3]} labels={['16:31', '16:32']} />);
    const spark = screen.getByRole('img', { name: 'Trend, latest 3' });
    expect(document.getElementById(spark.getAttribute('aria-describedby')!)).toHaveTextContent('16:323');
  });

  it('a Sparkline in a tile is decorative', () => {
    const { container } = render(<Sparkline values={[1, 2, 3]} decorative />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('more than 500 points step through at most 200, keeping the peaks; the table uses the same set', async () => {
    const values = Array.from({ length: 720 }, (_, i) => (i === 333 ? 99 : 10));
    expect(downsample(500, [{ values: values.slice(0, 500) }])).toHaveLength(500);
    const keep = downsample(720, [{ values }]);
    expect(keep).toHaveLength(DOWNSAMPLE_TO);
    expect(keep).toContain(333);
    render(
      <LineChart title="CPU" unit="%" labels={values.map((_, i) => `p${i}`)} series={[{ name: 'CPU', values }]} />,
    );
    const table = screen.getByRole('table', { name: 'CPU' });
    expect(within(table).getAllByRole('row')).toHaveLength(DOWNSAMPLE_TO + 1);
    expect(table).toHaveTextContent('p33399%');
    screen.getByRole('img', { name: /^CPU\./ }).focus();
    await userEvent.keyboard('{End}');
    const last = within(table).getAllByRole('rowheader').at(-1)!.textContent;
    expect(status()).toHaveTextContent(`${last}, CPU 10%`);
  });

  it('in forced colours, each series has its own line style and fill pattern', () => {
    expect(new Set([0, 1, 2, 3, 4, 5].map(seriesDash)).size).toBe(6);
    const { container } = render(
      <LineChart
        title="Network"
        labels={['a', 'b']}
        series={[
          { name: 'In', values: [1, 2] },
          { name: 'Out', values: [3, 4] },
        ]}
      />,
    );
    const lines = [...container.querySelectorAll<SVGPathElement>('.hl-chart-line')];
    expect(lines.map((l) => l.style.getPropertyValue('--hl-dash'))).toEqual(['none', '8 4']);
    const columns = render(
      <StackedColumns
        labels={['a']}
        series={[
          { name: 'A', values: [1] },
          { name: 'B', values: [1] },
        ]}
      />,
    );
    const fills = [...columns.container.querySelectorAll<SVGRectElement>('.hl-chart-fill')].map((r) =>
      r.style.getPropertyValue('--hl-pattern'),
    );
    expect(new Set(fills).size).toBe(2);
    for (const fill of fills) expect(columns.container.querySelector(fill.slice(4, -1))).not.toBeNull();
  });
});
