import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { BarChart, LineChart, niceMax, seriesColor, Sparkline, StackedBar, StackedColumns } from '../src/index';

describe('chart helpers', () => {
  it('picks clean axis maxima and fixed series colours', () => {
    expect([0, 7, 12, 23, 180, 4100].map(niceMax)).toEqual([1, 10, 20, 25, 200, 5000]);
    expect(seriesColor(0)).toBe('var(--chart-1)');
    expect(seriesColor(5)).toBe('var(--chart-6)');
  });
});

describe('LineChart', () => {
  const props = {
    title: 'CPU',
    unit: '%',
    max: 100,
    labels: ['10:00', '10:05', '10:10'],
    series: [
      { name: 'Immich', values: [10, 40, 25] },
      { name: 'Jellyfin', values: [5, 8, 30] },
    ],
  };

  it('steps through values with arrow keys and shows every series in the tooltip', async () => {
    render(<LineChart {...props} />);
    const plot = screen.getByRole('img', { name: /CPU\. Use left and right arrow keys/ });
    plot.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('status')).toHaveTextContent('10:00, Immich 10%, Jellyfin 5%');
    expect(document.querySelector('.hl-chart-tip')).toHaveTextContent('Immich10%');
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('status')).toHaveTextContent('10:05, Immich 40%, Jellyfin 8%');
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(document.querySelector('.hl-chart-tip')).toBeNull();
  });

  it('has a legend for two or more series and a hidden data table', () => {
    render(<LineChart {...props} />);
    expect(screen.getAllByText('Immich').length).toBeGreaterThan(0);
    const table = screen.getByRole('table', { name: 'CPU' });
    expect(within(table).getByRole('rowheader', { name: '10:10' })).toBeInTheDocument();
    expect(
      within(table)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['10%', '5%', '40%', '8%', '25%', '30%']);
  });
});

describe('BarChart', () => {
  it('marks failed runs with an × and says so in words', () => {
    render(
      <BarChart
        title="Backup size"
        unit=" GB"
        data={[
          { label: 'Mon', value: 2 },
          { label: 'Tue', value: 3, status: 'failed' },
        ]}
      />,
    );
    expect(screen.getByRole('img', { name: 'Tue: 3 GB, failed' })).toBeInTheDocument();
    expect(screen.getAllByTestId('failed-mark')).toHaveLength(1);
    fireEvent.focus(screen.getByRole('img', { name: 'Tue: 3 GB, failed' }));
    expect(screen.getAllByText('Failed').length).toBeGreaterThan(0);
    expect(screen.getByRole('table', { name: 'Backup size' })).toHaveTextContent('3 GB (failed)');
  });
});

describe('StackedBar and Sparkline', () => {
  it('names each part and what is free', () => {
    render(
      <StackedBar
        title="Storage"
        unit="GB"
        total={1000}
        segments={[
          { label: 'Apps', value: 120 },
          { label: 'Files', value: 300 },
        ]}
      />,
    );
    expect(
      screen.getByRole('img', { name: /^Storage\. Apps 120 GB, Files 300 GB, Free 580 GB\./ }),
    ).toBeInTheDocument();
    expect(screen.getByText('420 GB of 1,000 GB')).toBeInTheDocument();
  });

  it('describes the latest value', () => {
    render(<Sparkline values={[1, 3, 2, 12]} />);
    expect(screen.getByRole('img', { name: 'Trend, latest 12' })).toBeInTheDocument();
  });
});

describe('LineChart peak note and StackedColumns', () => {
  it('shows a note beside the title', () => {
    render(
      <LineChart
        title="CPU over the last hour"
        aside="Peak 46% at 16:32"
        labels={['a', 'b']}
        series={[{ name: 'CPU', values: [1, 46] }]}
      />,
    );
    expect(document.querySelector('figcaption')).toHaveTextContent('CPU over the last hourPeak 46% at 16:32');
  });

  it('stacks the series per column, names each in a legend, and steps with arrow keys', async () => {
    const fmt = (v: number) => `${v} GB`;
    render(
      <StackedColumns
        title="Memory"
        labels={['10:00', '10:01']}
        formatValue={fmt}
        series={[
          { name: 'Immich', values: [2, 3] },
          { name: 'Other', values: [5, 4] },
        ]}
      />,
    );
    const figure = screen.getByRole('figure');
    expect(figure.querySelector('.hl-chart-legend')).toHaveTextContent('Immich');
    expect(figure.querySelector('.hl-chart-legend')).toHaveTextContent('Other');
    // Two columns of two parts, coloured chart-1 then chart-2.
    const rects = figure.querySelectorAll('rect.hl-chart-fill');
    expect(rects).toHaveLength(4);
    expect(rects[0]).toHaveStyle({ fill: 'var(--chart-1)' });
    expect(rects[1]).toHaveStyle({ fill: 'var(--chart-2)' });
    screen.getByRole('img', { name: /Memory\. Use left and right/ }).focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByRole('status')).toHaveTextContent('10:01, Immich 3 GB, Other 4 GB');
    const table = screen.getByRole('table', { hidden: true });
    expect(within(table).getAllByRole('row')).toHaveLength(3);
  });
});
