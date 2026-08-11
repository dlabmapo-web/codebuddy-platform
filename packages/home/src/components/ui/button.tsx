import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

/*
 * shadcn's Button, with COVE Edu's variants substituted for the stock ones —
 * and without shadcn's `asChild`.
 *
 * `@radix-ui/react-slot` calls `React.createContext` at module scope and ships
 * no `use client` directive, so importing it from a server component fails the
 * build outright. Every control on this site is a link, so the fix is also the
 * simpler shape: put `buttonVariants()` on the anchor itself and skip the
 * wrapper entirely. `Button` stays for the day something here actually submits.
 *
 * The primary fill is the mark's wave — blue running into teal — carried on a
 * shadow tinted with the same blue, so the button appears to sit in coloured
 * light rather than on a neutral grey drop. `-translate-y-px` on hover and a
 * return to zero on `:active` give it the press it was missing.
 *
 * `[&_svg]:translate-x-*` is why an arrow inside any of these slides on hover
 * without a wrapper or a second class at the call site.
 */
const buttonVariants = cva(
  [
    "group relative inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "rounded-[10px] font-semibold",
    "transition-[transform,box-shadow,background-color,border-color,color] duration-200 ease-out",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:transition-transform [&_svg]:duration-200",
    "hover:[&_svg]:translate-x-0.5",
    "motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:hover:[&_svg]:translate-x-0",
  ],
  {
    variants: {
      variant: {
        solid: [
          "cove-sheen cove-grad-brand text-on-blue shadow-brand",
          // A one-pixel inner highlight along the top edge. It is what stops a
          // filled gradient button from reading as a flat coloured rectangle.
          "before:absolute before:inset-x-0 before:top-0 before:h-px before:rounded-t-[10px]",
          "before:bg-white/30 before:content-['']",
          "hover:-translate-y-px hover:shadow-brand-lift active:translate-y-0",
        ],
        outline: [
          "border border-line bg-paper text-ink shadow-card",
          "hover:-translate-y-px hover:border-cove-blue/40 hover:text-cove-blue hover:shadow-lift",
          "active:translate-y-0",
        ],
        onDeepSolid: [
          "bg-paper text-cove-deep shadow-[0_10px_26px_-10px_rgb(0_0_0/0.5)]",
          "hover:-translate-y-px hover:bg-white active:translate-y-0",
        ],
        onDeepOutline: [
          "border border-white/25 text-on-deep backdrop-blur-sm",
          "hover:-translate-y-px hover:border-white/60 hover:bg-white/10",
          "active:translate-y-0",
        ],
        ghost: "text-ink hover:text-cove-blue",
      },
      size: {
        sm: "h-9 px-3.5 text-[14px]",
        md: "h-11 px-5 text-[15px]",
        lg: "h-13 px-7 text-[16px]",
      },
    },
    defaultVariants: { variant: "solid", size: "md" },
  },
);

export function Button({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return (
    <button
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { buttonVariants };
