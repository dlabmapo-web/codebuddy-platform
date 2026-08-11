import type { TFunction } from "i18next";

/**
 * The `t` a section component receives.
 *
 * Each page resolves translations once and passes `t` down, so a section is a
 * plain function of its copy and never opens its own i18next instance. The
 * namespace tuple is part of the type, which is what keeps a typo in
 * `t("about.titel")` a compile error rather than a raw dotted key on screen.
 */
export type MarketingT = TFunction<["marketing"]>;

/**
 * The product page's own copy.
 *
 * Scoped to `product` alone. The shared chrome takes a separate `MarketingT`,
 * which is cheaper to read than prefixing forty call sites with `marketing:`
 * and keeps each section honest about which namespace it actually depends on.
 */
export type ProductT = TFunction<["product"]>;
