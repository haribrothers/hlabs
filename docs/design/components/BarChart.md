# BarChart

Columns for one measure over days or runs, such as backup size per night on the Backups screen.

Bars use `chart-1`, at most 24px wide, with a 4px rounded top and a square base. A run with `status: 'failed'` turns `danger` and gets an × above it, so failure never relies on colour alone. The tooltip names the run, its value and its status.

Label the x-axis sparsely (the component thins labels to about eight). Always start at zero.
