/**
 * Attributes Django synthesizes: `get_<field>_display`, `pk`/`id`, and
 * zero-argument model methods.
 *
 * resolveChain already ACCEPTED all three — no squiggle on
 * `{{ order.get_status_display }}` — but describeChainSegment had no case for
 * them, so it fell through to `return null` and hover showed NOTHING. The
 * completion list left them out too. The editor knew they were valid and still
 * declined to say anything about them.
 */
import { describe, it, expect } from 'vitest';
import { describeChainSegment } from './describe-chain';
import { buildChainEntries } from './completion-entries';
import { resolveChain } from './chain-resolver';
import { createModelGraph } from './model-graph';
import { parseModels } from '$domain/parsers/models';

const MODELS = `
from django.db import models

class Order(models.Model):
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("delivered", "Delivered"),
        ("cancelled", "Cancelled"),
    ]
    status = models.CharField(max_length=20, choices=STATUS_CHOICES)
    total = models.DecimalField(max_digits=10, decimal_places=2)

    def is_late(self):
        return False

class Ticket(models.Model):
    code = models.UUIDField(primary_key=True)
`;
const parsed = parseModels(MODELS, { filePath: 'shop/models.py' });
if (!parsed.ok) throw new Error('fixture failed to parse');
const graph = createModelGraph(parsed.value);

const ORDER = { kind: 'instance' as const, model: 'Order' };
const seg = (chain: string[]) => describeChainSegment(chain, chain.length - 1, ORDER, graph);

describe('get_<field>_display', () => {
  it('resolves without an error, as it always did', () => {
    expect(resolveChain(['order', 'get_status_display'], ORDER, graph).error).toBeUndefined();
  });

  it('is described, not dropped', () => {
    expect(seg(['order', 'get_status_display'])?.kind).toBe('choice-display');
  });

  it('carries the field it reads, so the choices can be shown', () => {
    const info = seg(['order', 'get_status_display']);
    expect(info?.kind === 'choice-display' && info.field.name).toBe('status');
  });

  it('exposes the labels, which are what the method actually returns', () => {
    const info = seg(['order', 'get_status_display']);
    const values =
      info?.kind === 'choice-display'
        ? info.field.choices?.kind !== 'unresolved'
          ? (info.field.choices?.values ?? [])
          : []
        : [];
    expect(values.map(c => `${c.value}=${c.label}`)).toEqual([
      'pending=Pending',
      'delivered=Delivered',
      'cancelled=Cancelled',
    ]);
  });

  it('is offered by completion, with the labels in the detail', () => {
    const entry = buildChainEntries(ORDER, graph).find(e => e.label === 'get_status_display');
    expect(entry?.kind).toBe('choice-display');
    expect(entry?.detail).toContain('Pending');
  });

  it('is not invented for a field without choices', () => {
    expect(seg(['order', 'get_total_display'])).toBeNull();
    expect(buildChainEntries(ORDER, graph).map(e => e.label)).not.toContain('get_total_display');
  });
});

describe('pk and the implicit id', () => {
  it('describes pk', () => {
    expect(seg(['order', 'pk'])?.kind).toBe('implicit-pk');
  });

  it('describes id when the primary key is the implicit one', () => {
    expect(seg(['order', 'id'])?.kind).toBe('implicit-pk');
  });

  it('offers pk and id in completion', () => {
    const labels = buildChainEntries(ORDER, graph).map(e => e.label);
    expect(labels).toContain('pk');
    expect(labels).toContain('id');
  });

  // An explicit primary key REPLACES id — claiming otherwise hides a real
  // mistake on a model keyed by a UUID.
  it('does not offer id on a model with an explicit primary key', () => {
    const ticket = { kind: 'instance' as const, model: 'Ticket' };
    expect(buildChainEntries(ticket, graph).map(e => e.label)).not.toContain('id');
    expect(describeChainSegment(['t', 'id'], 1, ticket, graph)).toBeNull();
  });
});

describe('zero-argument model methods', () => {
  it('is described', () => {
    expect(seg(['order', 'is_late'])?.kind).toBe('method');
  });

  it('is offered by completion', () => {
    const entry = buildChainEntries(ORDER, graph).find(e => e.label === 'is_late');
    expect(entry?.kind).toBe('method');
  });
});

describe('a real mistake is still a mistake', () => {
  it('an invented attribute is neither described nor offered', () => {
    expect(seg(['order', 'nonsense'])).toBeNull();
    expect(buildChainEntries(ORDER, graph).map(e => e.label)).not.toContain('nonsense');
  });
});
