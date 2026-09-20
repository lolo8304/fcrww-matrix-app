import type { Room } from 'matrix-js-sdk';

export function getRetentionLabel(room: Room): string | undefined {
  const lifetime: unknown = room.currentState.getStateEvents('m.room.retention', '')?.getContent().max_lifetime;
  if (typeof lifetime !== 'number' || !Number.isFinite(lifetime) || lifetime <= 0) return;
  const units = [
    {milliseconds: 86400000, singular: 'Tag', plural: 'Tage'},
    {milliseconds: 3600000, singular: 'Stunde', plural: 'Stunden'},
    {milliseconds: 60000, singular: 'Minute', plural: 'Minuten'},
    {milliseconds: 1000, singular: 'Sekunde', plural: 'Sekunden'},
  ];
  const unit = units.find(unit => lifetime % unit.milliseconds === 0) ?? units[3];
  const count = lifetime / unit.milliseconds;
  return `Aufbewahrung: ${count.toLocaleString('de-CH', {maximumFractionDigits: 3})} ${count === 1 ? unit.singular : unit.plural}`;
}
