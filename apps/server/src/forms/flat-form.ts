import { PDFDocument } from 'pdf-lib'
import type { PDFPage } from 'pdf-lib'
import { extractTextItems } from 'unpdf'
import { z } from 'zod'
import type { PlacedField } from '@offee/contracts'
import { parseJsonObject } from '../workflows/form-answer.ts'

export type TextLine = {
  id: number
  page: number
  x: number
  y: number
  width: number
  size: number
  text: string
}

type PositionedText = Omit<TextLine, 'id'>

type Rectangle = { x: number; y: number; width: number; height: number }

// Words of one label sit a space apart, about a third of the font size; a wider gap on the same
// row starts another column's label.
const largestGapWithinLabelPerFontSize = 0.6
const sameRowTolerance = 2
const pageMargin = 36
const textFieldHeight = 12
const checkboxSize = 10
const smallestTextFieldWidth = 40
const largestFieldWidthLeftOfLabel = 150
const positions = ['below', 'above', 'right', 'left'] as const

const readPageTexts = async (content: Uint8Array): Promise<PositionedText[]> =>
  (await extractTextItems(new Uint8Array(content))).items.flatMap((pageItems, index) =>
    pageItems.flatMap((item) =>
      item.str.trim() === '' ? [] : [{ page: index + 1, x: item.x, y: item.y, width: item.width, size: item.fontSize, text: item.str.trim() }],
    ),
  )

const sameRow = (left: { page: number; y: number }, right: { page: number; y: number }): boolean =>
  left.page === right.page && Math.abs(left.y - right.y) <= sameRowTolerance

const mergeIntoLines = (texts: PositionedText[]): PositionedText[] =>
  texts
    .toSorted((left, right) => left.page - right.page || (sameRow(left, right) ? left.x - right.x : right.y - left.y))
    .reduce<PositionedText[]>((lines, text) => {
      const last = lines.at(-1)
      if (last === undefined || !sameRow(last, text) || text.x - (last.x + last.width) > largestGapWithinLabelPerFontSize * Math.max(last.size, text.size)) {
        return [...lines, text]
      }
      const merged = { ...last, width: text.x + text.width - last.x, size: Math.max(last.size, text.size), text: `${last.text} ${text.text}` }
      return [...lines.slice(0, -1), merged]
    }, [])

/**
 * Reads a PDF's text as labelled lines with their positions, so a form drawn without fields
 * can still say where its labels are. Text close together on one row is one label; text
 * further apart is a label of another column.
 * @param content The PDF.
 * @returns The lines, page by page from top to bottom and left to right, numbered from 1.
 */
export const readTextLines = async (content: Uint8Array): Promise<TextLine[]> =>
  mergeIntoLines(await readPageTexts(content)).map((line, index) => ({ id: index + 1, ...line }))

/**
 * The JSON schema the model must answer in when it places fields on a form that has none.
 * @param lines The form's text lines.
 * @returns The schema.
 */
export const fieldPlacementSchemaFor = (lines: TextLine[]): Record<string, unknown> => ({
  type: 'object',
  properties: {
    fields: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          line: { type: 'integer', enum: lines.map((line) => line.id) },
          name: { type: 'string' },
          kind: { type: 'string', enum: ['text', 'checkbox'] },
          position: { type: 'string', enum: positions },
        },
        required: ['line', 'name', 'kind', 'position'],
      },
    },
  },
  required: ['fields'],
})

const placementAnswerSchema = z.object({
  fields: z.array(
    z.object({
      line: z.number().int(),
      name: z.string(),
      kind: z.enum(['text', 'checkbox']).catch('text'),
      position: z.enum(positions).catch('below'),
    }),
  ),
})

// A dot separates the parts of a field's full name in a PDF, so a label like "Lfd. Nr." loses it.
const fieldNameOf = (name: string): string => name.replace(/\./g, '').replace(/\s+/g, ' ').trim()

/**
 * Keeps the fields that sit on an existing line and gives each a name of its own: a name
 * already taken gets a number, so "Vorname" twice becomes "Vorname" and "Vorname 2".
 * @param fields The fields, from the model or from the person's corrections.
 * @param lines The form's text lines.
 * @returns The usable fields, in the same order.
 */
export const usablePlacedFields = (fields: PlacedField[], lines: TextLine[]): PlacedField[] => {
  const linesById = new Map(lines.map((line) => [line.id, line]))
  return fields.reduce<PlacedField[]>((usable, field) => {
    const line = linesById.get(field.line)
    const baseName = fieldNameOf(field.name) || fieldNameOf(line?.text ?? '')
    if (line === undefined || baseName === '') return usable
    const taken = new Set(usable.map((placed) => placed.name))
    const name =
      Array.from({ length: usable.length + 1 }, (_, index) => (index === 0 ? baseName : `${baseName} ${index + 1}`)).find((candidate) => !taken.has(candidate)) ??
      baseName
    return [...usable, { ...field, name }]
  }, [])
}

/**
 * Turns the model's answer into placed fields.
 * @param modelAnswer The model's raw answer.
 * @param lines The form's text lines.
 * @returns The placed fields, in the model's order; empty when the answer is unreadable.
 */
export const fieldPlacementsFromModelAnswer = (modelAnswer: string, lines: TextLine[]): PlacedField[] => {
  const parsed = placementAnswerSchema.safeParse(parseJsonObject(modelAnswer))
  return parsed.success ? usablePlacedFields(parsed.data.fields, lines) : []
}

const rightEdgeFor = (line: TextLine, from: number, lines: TextLine[], page: PDFPage): number => {
  const nextLabel = lines.filter((other) => sameRow(other, line) && other.x > from).toSorted((left, right) => left.x - right.x)[0]
  return nextLabel === undefined ? page.getWidth() - pageMargin : nextLabel.x - 6
}

const rectangleFor = (field: PlacedField, line: TextLine, lines: TextLine[], page: PDFPage): Rectangle => {
  const height = field.kind === 'checkbox' ? checkboxSize : textFieldHeight
  const widthFrom = (x: number): number => (field.kind === 'checkbox' ? checkboxSize : Math.max(rightEdgeFor(line, x, lines, page) - x, smallestTextFieldWidth))
  const onTheLine = line.y - (height - line.size) / 2
  if (field.position === 'left') {
    const width = field.kind === 'checkbox' ? checkboxSize : Math.max(Math.min(largestFieldWidthLeftOfLabel, line.x - pageMargin - 4), smallestTextFieldWidth)
    return { x: Math.max(line.x - width - 4, 0), y: onTheLine, width, height }
  }
  if (field.position === 'right') {
    const x = line.x + line.width + 4
    return { x, y: onTheLine, width: widthFrom(x), height }
  }
  return { x: line.x, y: field.position === 'above' ? line.y + line.size + 1 : line.y - 2 - height, width: widthFrom(line.x), height }
}

/**
 * Adds a real form field for every placed field, without border or background so the form's
 * own drawing still shows.
 * @param content The PDF without fields.
 * @param fields The placed fields.
 * @param lines The form's text lines, to find each label and stop a field before the next one.
 * @returns The PDF with the fields added.
 */
export const addPlacedFields = async (content: Uint8Array, fields: PlacedField[], lines: TextLine[]): Promise<Uint8Array> => {
  const document = await PDFDocument.load(content, { ignoreEncryption: true })
  const form = document.getForm()
  const pages = document.getPages()
  const linesById = new Map(lines.map((line) => [line.id, line]))
  usablePlacedFields(fields, lines).forEach((field) => {
    const line = linesById.get(field.line)
    const page = line === undefined ? undefined : pages[line.page - 1]
    if (line === undefined || page === undefined) return
    const appearance = { ...rectangleFor(field, line, lines, page), borderWidth: 0, backgroundColor: undefined }
    if (field.kind === 'checkbox') {
      form.createCheckBox(field.name).addToPage(page, appearance)
      return
    }
    const textField = form.createTextField(field.name)
    textField.addToPage(page, appearance)
    textField.setFontSize(9)
  })
  return document.save()
}
