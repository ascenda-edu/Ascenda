import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

// The hover lift belongs to the SOLID CTA variants only. It used to sit in the
// base class, so every button in the app rose on hover — including icon buttons,
// toolbar ghosts and inline links, where a 2px jump reads as a glitch rather
// than an affordance. `active:translate-y-0` travels with it.
const lift = "hover:-translate-y-0.5 hover:shadow-e-2 active:translate-y-0";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-full text-sm font-medium ring-offset-background transition-[transform,box-shadow,background-color,border-color,color] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 max-w-full whitespace-normal text-center leading-snug shadow-e-1",
  {
    variants: {
      variant: {
        default: `bg-primary text-primary-foreground shadow-e-2 shadow-primary/20 ${lift}`,
        destructive: `bg-destructive text-destructive-foreground shadow-e-2 shadow-destructive/15 ${lift}`,
        // These three don't lift, but they must still respond. Moving the lift out of
        // the base class left outline/ghost/soft with NO hover state at all across 48
        // call sites (including the navbar sign-out) — a surface tint is the right
        // affordance for a flat control.
        // The secondary CTA, and the reason "the buttons look grey with hard
        // borders": this was `border-input bg-background`. `--input` is
        // deliberately a mid-grey (60% lightness light / 42% dark) because a FORM
        // FIELD's boundary must clear 3:1 against its own fill — but a button is
        // identified by its label, so it was paying that cost in grey for nothing,
        // and `bg-background` punched a grey hole in whatever card it sat on.
        //
        // Brand indigo instead, at full strength rather than an alpha: the border
        // is still the only thing identifying this control, so it has to hold 3:1
        // in BOTH themes, and it doesn't — `border-primary/70` measures 3.63:1 on a
        // light card but only 2.38:1 on a dark one. Full `border-primary` is
        // 6.99:1 / 3.57:1. `bg-transparent` (not `bg-card`) so the button doesn't
        // punch a hole in a tinted panel; the tint arrives on hover instead.
        outline:
          "border border-primary bg-transparent text-primary-ink hover:bg-primary/8",
        secondary:
          `bg-secondary text-secondary-foreground shadow-e-2 shadow-secondary/15 ${lift}`,
        ghost: "text-foreground hover:bg-muted/60",
        link: "text-primary-ink underline-offset-4 hover:underline",
        soft:
          "bg-accent/15 text-foreground border border-accent/30 shadow-e-1 hover:bg-accent/25 hover:border-accent/50",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-full px-3",
        lg: "h-11 rounded-full px-8",
        icon: "h-10 w-10",
        xs: "h-7 rounded-full px-2 text-xs",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
  VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
