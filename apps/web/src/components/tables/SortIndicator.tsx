import { CaretDownIcon, CaretSortIcon, CaretUpIcon } from '@radix-ui/react-icons'

/** The caret beside a sortable column heading, showing its sort direction. */
export const SortIndicator = ({ direction }: { direction: false | 'asc' | 'desc' }) =>
  direction === 'asc' ? <CaretUpIcon /> : direction === 'desc' ? <CaretDownIcon /> : <CaretSortIcon color="var(--gray-8)" />
