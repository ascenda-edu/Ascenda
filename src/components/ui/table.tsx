import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Table primitives.
 *
 * The four hand-styled `<table>`s in the app (toolbox/requirements-checker,
 * counsellor application-overview + outcome-dashboard, admin/simulation) share
 * two bugs this file exists to fix:
 *
 *  1. They wrap in `overflow-x-auto` with **no `min-w` on the table**, so a
 *     six-column table doesn't scroll on a narrow viewport — it compresses each
 *     column into an unreadable sliver. A scroll container only helps if the
 *     content refuses to shrink, so `Table` sets a floor width by default.
 *  2. Two of them sit directly on the page background with no card. This file
 *     deliberately draws no outer surface of its own — a table is content, not a
 *     card — so wrap it in `.surface-card` at the call site the way every other
 *     block of page content is wrapped.
 *
 * `tabular-nums` is set on the table element rather than per-cell: it only
 * changes digit advance widths, and columns of misaligned figures is the one
 * thing every table here has in common.
 */

export interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  /** Classes for the scroll container (e.g. `max-h-96`, needed by `<TableHeader sticky>`). */
  containerClassName?: string;
}

const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className, containerClassName, ...props }, ref) => (
    <div className={cn('relative w-full overflow-auto', containerClassName)}>
      <table
        ref={ref}
        // `min-w-[40rem]` is the scroll floor described above. Override it
        // through `className` for a genuinely narrow (2–3 column) table.
        className={cn('w-full min-w-[40rem] caption-bottom text-sm tabular-nums', className)}
        {...props}
      />
    </div>
  )
);
Table.displayName = 'Table';

export interface TableHeaderProps extends React.HTMLAttributes<HTMLTableSectionElement> {
  /**
   * Pin the header while the body scrolls. The scroll container is `Table`'s own
   * wrapper, so this only does anything once that wrapper has a bounded height —
   * give it one via `Table`'s `containerClassName`.
   *
   * Applied per-`<th>` rather than to the `<thead>`: `position: sticky` has no
   * effect on a table section in Chrome/Safari, only on the cells.
   */
  sticky?: boolean;
}

const TableHeader = React.forwardRef<HTMLTableSectionElement, TableHeaderProps>(
  ({ className, sticky = false, ...props }, ref) => (
    <thead
      ref={ref}
      className={cn(
        '[&_tr]:border-b [&_tr]:border-border',
        // Needs an opaque fill or body rows show through while scrolling.
        sticky && '[&_th]:sticky [&_th]:top-0 [&_th]:z-raised [&_th]:bg-card',
        className
      )}
      {...props}
    />
  )
);
TableHeader.displayName = 'TableHeader';

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />
  )
);
TableBody.displayName = 'TableBody';

const TableFooter = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tfoot
      ref={ref}
      className={cn('border-t border-border bg-muted font-medium [&>tr]:last:border-b-0', className)}
      {...props}
    />
  )
);
TableFooter.displayName = 'TableFooter';

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        'border-b border-border transition-colors hover:bg-muted data-[state=selected]:bg-primary/10',
        className
      )}
      {...props}
    />
  )
);
TableRow.displayName = 'TableRow';

/** Shared by `TableHead` and `TableCell`: right-align a column of figures. */
interface NumericProps {
  /** Right-align this cell. Digits are already tabular table-wide. */
  numeric?: boolean;
}

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement> & NumericProps
>(({ className, numeric = false, ...props }, ref) => (
  <th
    ref={ref}
    // `.eyebrow` is the house micro-label (11px, uppercase, tracked, muted) and
    // is already what all four existing tables use for their header cells.
    className={cn(
      'eyebrow whitespace-nowrap px-3 py-3 align-middle',
      numeric ? 'text-right' : 'text-left',
      className
    )}
    {...props}
  />
));
TableHead.displayName = 'TableHead';

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement> & NumericProps
>(({ className, numeric = false, ...props }, ref) => (
  <td ref={ref} className={cn('px-3 py-2.5 align-middle', numeric && 'text-right', className)} {...props} />
));
TableCell.displayName = 'TableCell';

const TableCaption = React.forwardRef<HTMLTableCaptionElement, React.HTMLAttributes<HTMLTableCaptionElement>>(
  ({ className, ...props }, ref) => (
    <caption ref={ref} className={cn('mt-3 text-body-sm text-muted-foreground', className)} {...props} />
  )
);
TableCaption.displayName = 'TableCaption';

export { Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell, TableCaption };
