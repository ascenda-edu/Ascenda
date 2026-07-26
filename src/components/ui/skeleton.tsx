import { cn } from "@/lib/utils"

function Skeleton({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            // rounded-lg is the ladder's first step (bound to --radius); the
            // stock shadcn `rounded-md` was the only radius in the app that
            // wasn't. animate-pulse is kept deliberately over the `shimmer`
            // keyframe: shimmer needs a gradient overlay child, and adding a
            // pseudo-element + overflow-hidden to a primitive with 33 consumers
            // buys a nicer idle state at the cost of clipping surprises.
            className={cn("animate-pulse rounded-lg bg-muted", className)}
            {...props}
        />
    )
}

export { Skeleton }
