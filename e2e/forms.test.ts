import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { PDFCheckBox, PDFDocument, PDFTextField } from 'pdf-lib'

// Any PDF can be tried, such as a form that failed for someone, before and after a fix.
const sampleFormPath = 'apps/web/public/samples/tenant-self-disclosure.pdf'
const formPath = process.env.OFFEE_E2E_FORM ?? sampleFormPath

const profile = {
  label: 'End to end (fictional)',
  firstName: 'Erika',
  lastName: 'Mustermann',
  role: 'Engineer',
  organization: 'Beispiel GmbH',
  email: 'erika@example.org',
  phone: '+49 30 1234567',
  street: 'Musterstraße 1',
  postalCode: '10115',
  city: 'Berlin',
  country: 'Germany',
  languages: ['German', 'English'],
  tone: '',
  facts: 'Date of birth: 12.08.1984\nPlace of birth: Köln\nNationality: German',
  signatureImage: null,
}

const idOf = (body: unknown): string => (typeof body === 'object' && body !== null && 'id' in body && typeof body.id === 'string' ? body.id : '')

test('fills a PDF form end to end with the local model', async ({ page, baseURL }) => {
  const created = await page.request.post('/api/profiles', { headers: { origin: baseURL ?? '' }, data: profile })
  expect(created.ok()).toBe(true)
  const profileId = idOf(await created.json())
  await page.addInitScript((context) => localStorage.setItem('offee.workContext', context), JSON.stringify({ profileId, personaId: null }))

  await page.goto('/forms')
  await page.locator('input[type=file]').setInputFiles(formPath)
  const review = page.getByText('Check every value')
  // An error, or a form Offee found no place to fill in, ends the wait at once.
  const failure = page.getByRole('alert').or(page.getByText('Offee found no place to fill in'))
  await expect(review.or(failure)).toBeVisible({ timeout: 60 * 60_000 })
  expect(await failure.isVisible() ? await failure.innerText() : '', 'Offee showed an error instead of the fields').toBe('')
  await test.info().attach('review', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })

  await page.getByRole('button', { name: 'Save filled', exact: true }).click()
  const downloadLink = page.getByRole('link', { name: 'Download the PDF' })
  await expect(downloadLink.or(page.getByRole('alert'))).toBeVisible({ timeout: 5 * 60_000 })
  expect(await page.getByRole('alert').isVisible() ? await page.getByRole('alert').innerText() : '', 'Offee showed an error instead of the saved PDF').toBe('')
  const download = page.waitForEvent('download')
  await downloadLink.click()
  const filledPath = await (await download).path()
  await test.info().attach('filled.pdf', { path: filledPath, contentType: 'application/pdf' })

  const fields = (await PDFDocument.load(await readFile(filledPath))).getForm().getFields()
  const filledCount = fields.filter((field) => (field instanceof PDFTextField && (field.getText() ?? '') !== '') || (field instanceof PDFCheckBox && field.isChecked())).length
  test.info().annotations.push({ type: 'fields', description: `${filledCount} of ${fields.length} fields filled` })
  expect(filledCount).toBeGreaterThan(0)
  // The profile alone fills most of the sample; only the model reads the date of birth out of the
  // profile's facts, so without this a run whose model answers went unused would still pass.
  if (formPath === sampleFormPath) {
    expect((await PDFDocument.load(await readFile(filledPath))).getForm().getTextField('Date of birth').getText()).toBe('12.08.1984')
  }
})
