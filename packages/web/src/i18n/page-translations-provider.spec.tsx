import type { Resource } from 'i18next';
import { renderToStaticMarkup } from 'react-dom/server';
import { useTranslation } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { PageTranslationsProvider } from './page-translations-provider';

/**
 * Deliberately untyped keys. The suite feeds the provider its own small
 * bundles rather than the product's, so the typed-key machinery — which is
 * built from the real catalogs — has nothing to say about them.
 */
function Copy({ ns, k }: { ns: string; k: string }) {
  const { t } = useTranslation(ns as never);
  return <p>{(t as (key: string) => string)(k)}</p>;
}

function renderWith(
  namespaces: readonly string[],
  resources: Resource,
  ns: string,
  key: string,
): string {
  return renderToStaticMarkup(
    <PageTranslationsProvider
      locale="en"
      namespaces={namespaces}
      resources={resources}
    >
      <Copy k={key} ns={ns} />
    </PageTranslationsProvider>,
  );
}

describe('PageTranslationsProvider', () => {
  /*
   * `renderToStaticMarkup` runs no effects and gives no second pass, so copy
   * that resolves here resolves on the first paint.
   *
   * This does *not* cover the role-switch bug. That one is React preserving
   * this provider's state across a soft refresh — the same client component in
   * the same slot, keeping the previous role's instance — and reproducing it
   * needs a client rerender, which this package has no DOM environment for.
   * The guard against it is the signature check in the provider, verified by
   * hand.
   */
  it('resolves copy on the very first render, with no effects run', () => {
    const markup = renderWith(
      ['teaching'],
      { en: { teaching: { filters: { all_classes: 'All classes' } } } },
      'teaching',
      'filters.all_classes',
    );

    expect(markup).toContain('All classes');
    expect(markup).not.toContain('filters.all_classes');
  });

  /** Each role's overview mounts its own namespace; both must resolve. */
  it('resolves a second role\'s namespace just as well', () => {
    const markup = renderWith(
      ['lead'],
      { en: { lead: { catalog: { title: 'Catalog' } } } },
      'lead',
      'catalog.title',
    );

    expect(markup).toContain('Catalog');
    expect(markup).not.toContain('catalog.title');
  });
});
