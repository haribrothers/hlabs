// Resources for apps (US-SYS-19): CPU, memory and disk for hlabs's own Colima, applied by restarting the engine
// (US-SYS-18). Other engines show what they report, read-only; Linux has no such section (containers use the host).
import { Button, List, ListRow } from '@hlabs/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { engineCopy } from '../copy/engine';
import { showToast } from '../lib/toasts';
import { useTRPC, useTRPCClient } from '../lib/trpc';
import type { EngineOverview } from './engine-types';

const copy = engineCopy;
const GIB = 2 ** 30;
const gib = (bytes: number) => Math.round(bytes / GIB);

type Resources = NonNullable<EngineOverview['resources']>;

function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  display: string;
  range: string;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <ListRow
      title={<label htmlFor={id}>{props.label}</label>}
      subtitle={<span id={`${id}-range`}>{props.range}</span>}
      trailing={
        <span className="flex items-center gap-4">
          <input
            id={id}
            type="range"
            className="w-48 accent-[var(--accent)]"
            min={props.min}
            max={props.max}
            step={1}
            value={props.value}
            aria-describedby={`${id}-range`}
            aria-valuetext={props.display}
            onChange={(e) => props.onChange(Number(e.target.value))}
          />
          <span className="w-16 text-right font-semibold tabular-nums">{props.display}</span>
        </span>
      }
    />
  );
}

export function EngineResources({ resources, engineName }: { resources: Resources; engineName: string }) {
  const client = useTRPCClient();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const l = resources.limits;
  const start = {
    cpus: resources.cpus ?? 1,
    memory: gib(resources.memoryBytes ?? l.minMemoryBytes),
    disk: gib(resources.diskBytes ?? l.minDiskBytes),
  };
  const [value, setValue] = useState(start);
  const changed = value.cpus !== start.cpus || value.memory !== start.memory || value.disk !== start.disk;
  const inRange =
    value.cpus >= 1 &&
    value.cpus <= l.maxCpus &&
    value.memory >= gib(l.minMemoryBytes) &&
    value.memory <= gib(l.maxMemoryBytes) &&
    value.disk >= gib(l.minDiskBytes) &&
    value.disk <= gib(l.maxDiskBytes);

  const apply = useMutation({
    mutationFn: () =>
      client.settings.engine.setResources.mutate({
        cpus: value.cpus,
        memoryBytes: value.memory * GIB,
        diskBytes: value.disk * GIB,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: trpc.jobs.list.queryKey() });
      void queryClient.invalidateQueries({ queryKey: trpc.settings.engine.get.queryKey() });
    },
    onError: () => showToast({ tone: 'danger', title: copy.applyFailed }),
  });

  const label = (
    <>
      {copy.resources}
      <span className="font-normal text-ink-muted"> · {copy.resourcesNote}</span>
    </>
  );

  if (!resources.editable) {
    const show = (n: number | null, gb = false) => (n === null ? copy.unknown : gb ? copy.gb(gib(n)) : String(n));
    return (
      <List label={label}>
        <ListRow title={copy.cpus} trailing={<span className="tabular-nums">{show(resources.cpus)}</span>} />
        <ListRow
          title={copy.memory}
          trailing={<span className="tabular-nums">{show(resources.memoryBytes, true)}</span>}
        />
        <ListRow title={copy.disk} trailing={<span className="tabular-nums">{show(resources.diskBytes, true)}</span>} />
        <ListRow title={<span className="text-ink-muted">{copy.changeIn(engineName)}</span>} />
      </List>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <List label={label}>
        <Slider
          label={copy.cpus}
          value={value.cpus}
          min={1}
          max={l.maxCpus}
          display={String(value.cpus)}
          range={copy.cpuRange(l.maxCpus)}
          onChange={(cpus) => setValue((v) => ({ ...v, cpus }))}
        />
        <Slider
          label={copy.memory}
          value={value.memory}
          min={gib(l.minMemoryBytes)}
          max={gib(l.maxMemoryBytes)}
          display={copy.gb(value.memory)}
          range={copy.gbRange(gib(l.minMemoryBytes), gib(l.maxMemoryBytes))}
          onChange={(memory) => setValue((v) => ({ ...v, memory }))}
        />
        <Slider
          label={copy.disk}
          value={value.disk}
          min={gib(l.minDiskBytes)}
          max={gib(l.maxDiskBytes)}
          display={copy.gb(value.disk)}
          range={copy.gbRange(gib(l.minDiskBytes), gib(l.maxDiskBytes))}
          onChange={(disk) => setValue((v) => ({ ...v, disk }))}
        />
      </List>
      {changed ? (
        <div className="flex justify-end">
          <Button disabled={!inRange} busy={apply.isPending} onClick={() => apply.mutate()}>
            {copy.apply}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
