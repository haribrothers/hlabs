# LineChart

A line chart for values over time: CPU, memory, network and per-app usage on the Usage screens.

- Series take `chart-1` … `chart-6` **in order**, never cycled. More than six apps: show the top five and fold the rest into "Other".
- One series: area wash, no legend (the title names it). Two or more: a legend above, line keys only.
- 2px lines, hairline grid, axis text in `ink-faint`. Text never takes the series colour.
- Hover or arrow keys show a crosshair and a tooltip with every series at that time. A hidden table carries the same data for screen readers.
- Percentages pass `max={100}` so the axis doesn't jump as values change. Never add a second y-axis; two units means two charts.

Loading shows the chart frame with a shimmer (see `UsageLoading`); no data yet says so in the plot area in `ink-muted`.
