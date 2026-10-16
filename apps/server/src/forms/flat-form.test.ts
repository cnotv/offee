import { PDFDocument, StandardFonts } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import type { PlacedField } from '@offee/contracts'
import { addPlacedFields, fieldPlacementsFromModelAnswer, readTextLines } from './flat-form.ts'
import { fillForm, readFormFields } from './pdf-form.ts'

// A form drawn as plain text, the way a printed form turned into a PDF looks: labels, no fields.
const makeFlatForm = async (): Promise<Uint8Array> => {
  const document = await PDFDocument.create()
  const font = await document.embedFont(StandardFonts.Helvetica)
  const page = document.addPage([600, 400])
  page.drawText('Familienname', { x: 60, y: 330, size: 8, font })
  page.drawText('Titel', { x: 370, y: 330, size: 8, font })
  page.drawText('Geburtsdatum:', { x: 60, y: 280, size: 10, font })
  page.drawText('leibliches Kind', { x: 80, y: 230, size: 8, font })
  return document.save()
}

const rectangleOf = (document: PDFDocument, name: string) => document.getForm().getField(name).acroField.getWidgets()[0]?.getRectangle()

describe('filling a form that has no fields', () => {
  it('reads each label as its own line, keeping labels in different columns apart', async () => {
    const lines = await readTextLines(await makeFlatForm())
    expect(lines.map((line) => [line.id, line.page, line.text, Math.round(line.x), Math.round(line.y)])).toEqual([
      [1, 1, 'Familienname', 60, 330],
      [2, 1, 'Titel', 370, 330],
      [3, 1, 'Geburtsdatum:', 60, 280],
      [4, 1, 'leibliches Kind', 80, 230],
    ])
  })

  it('names each field after its label, keeps only real lines, and reads an answer cut off at its limit', async () => {
    const lines = await readTextLines(await makeFlatForm())
    const cutOff = 'Here you go: {"fields": ["1 text right", "1 text below", "99 text below", "3 text sideways", "3 text below", "4 checkbox left", "2 text be'
    expect(fieldPlacementsFromModelAnswer(cutOff, lines)).toEqual([
      { line: 1, name: 'Familienname', kind: 'text', position: 'below' },
      { line: 1, name: 'Familienname 2', kind: 'text', position: 'below' },
      // "Geburtsdatum:" ends in a colon, so its answer follows on the line whatever the model said.
      { line: 3, name: 'Geburtsdatum', kind: 'text', position: 'right' },
      { line: 4, name: 'leibliches Kind', kind: 'checkbox', position: 'left' },
    ])
    expect(fieldPlacementsFromModelAnswer('no fields here', lines)).toEqual([])
  })

  it('adds real fields where they were placed, which the usual flow then fills', async () => {
    const lines = await readTextLines(await makeFlatForm())
    const placedFields: PlacedField[] = [
      { line: 1, name: 'Familienname', kind: 'text', position: 'below' },
      { line: 2, name: 'Titel', kind: 'text', position: 'above' },
      { line: 3, name: 'Geburtsdatum', kind: 'text', position: 'right' },
      { line: 4, name: 'leibliches Kind', kind: 'checkbox', position: 'left' },
    ]
    const withFields = await addPlacedFields(await makeFlatForm(), placedFields, lines)
    expect((await readFormFields(withFields)).map((field) => [field.name, field.kind])).toEqual([
      ['Familienname', 'text'],
      ['Titel', 'text'],
      ['Geburtsdatum', 'text'],
      ['leibliches Kind', 'checkbox'],
    ])

    const document = await PDFDocument.load(withFields)
    const surname = rectangleOf(document, 'Familienname')
    // Below the label, stopping before the next column's label.
    expect(surname?.x).toBe(60)
    expect(surname?.y).toBeLessThan(330)
    expect((surname?.x ?? 0) + (surname?.width ?? 0)).toBeLessThan(370)
    // Above the label, for a label printed under its blank line.
    expect(rectangleOf(document, 'Titel')?.y).toBeGreaterThan(330)
    // To the right of the label, on its line.
    expect(rectangleOf(document, 'Geburtsdatum')?.x).toBeGreaterThan(120)
    // The box just before its label.
    expect(rectangleOf(document, 'leibliches Kind')).toMatchObject({ x: 66, width: 10 })

    const filled = await fillForm(withFields, {
      values: [
        { name: 'Familienname', value: 'Lovelace', source: 'profile' },
        { name: 'leibliches Kind', value: 'yes', source: 'model' },
      ],
      sign: null,
    })
    const reread = (await PDFDocument.load(filled)).getForm()
    expect(reread.getTextField('Familienname').getText()).toBe('Lovelace')
    expect(reread.getCheckBox('leibliches Kind').isChecked()).toBe(true)
  })
})
