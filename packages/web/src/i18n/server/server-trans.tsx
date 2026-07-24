import { Trans } from 'react-i18next/TransWithoutContext';

/**
 * `<Trans>` for server components.
 *
 * The default export from `react-i18next` reads the instance out of React
 * context, which does not exist in an RSC. `TransWithoutContext` takes the `t`
 * from `getServerTranslation()` directly, so copy with inline markup —
 * "Signed in to <0>{{academy}}</0>" — stays one translatable sentence instead
 * of being concatenated from fragments that no other language can reorder.
 */
export { Trans as ServerTrans };
