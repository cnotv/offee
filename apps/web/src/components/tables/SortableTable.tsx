import { Flex, Table } from '@radix-ui/themes'
import { flexRender, useTable, type ColumnDef, type RowData } from '@tanstack/react-table'
import { SortIndicator } from './SortIndicator'
import { sortableTableFeatures } from './sortable-table-features'

interface SortableTableProps<Row extends RowData> {
  columns: ColumnDef<typeof sortableTableFeatures, Row, unknown>[]
  rows: Row[]
  rowKeyOf: (row: Row) => string
  numericColumnIds: string[]
}

/** A TanStack table on Radix Table with sortable headings and right-aligned numeric columns. */
export const SortableTable = <Row extends RowData>({
  columns,
  rows,
  rowKeyOf,
  numericColumnIds,
}: SortableTableProps<Row>) => {
  const table = useTable({
    features: sortableTableFeatures,
    columns,
    data: rows,
    getRowId: rowKeyOf,
  })
  const justifyOf = (columnId: string) => (numericColumnIds.includes(columnId) ? 'end' : undefined)

  return (
    <Table.Root variant="ghost" size="2">
      <Table.Header>
        {table.getHeaderGroups().map((headerGroup) => (
          <Table.Row key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <Table.ColumnHeaderCell key={header.id} justify={justifyOf(header.column.id)}>
                {header.column.getCanSort() ? (
                  <Flex asChild align="center" gap="1" display="inline-flex">
                    <button type="button" className="table-sort-button" onClick={header.column.getToggleSortingHandler()}>
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      <SortIndicator direction={header.column.getIsSorted()} />
                    </button>
                  </Flex>
                ) : (
                  flexRender(header.column.columnDef.header, header.getContext())
                )}
              </Table.ColumnHeaderCell>
            ))}
          </Table.Row>
        ))}
      </Table.Header>
      <Table.Body>
        {table.getRowModel().rows.map((row) => (
          <Table.Row key={row.id} align="center">
            {row.getAllCells().map((cell) => (
              <Table.Cell
                key={cell.id}
                justify={justifyOf(cell.column.id)}
                className={numericColumnIds.includes(cell.column.id) ? 'numeric-cell' : undefined}
              >
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </Table.Cell>
            ))}
          </Table.Row>
        ))}
      </Table.Body>
    </Table.Root>
  )
}
