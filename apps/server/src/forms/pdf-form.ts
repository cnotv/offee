import { PDFCheckBox, PDFDocument, PDFDropdown, PDFOptionList, PDFRadioGroup, PDFSignature, PDFTextField } from 'pdf-lib'
import type { PDFField } from 'pdf-lib'
import { pdflibAddPlaceholder } from '@signpdf/placeholder-pdf-lib'
import { P12Signer } from '@signpdf/signer-p12'
import { SignPdf } from '@signpdf/signpdf'
import { SUBFILTER_ETSI_CADES_DETACHED } from '@signpdf/utils'
import type { FieldSuggestion, FormField, FormFieldKind, Profile } from '@offee/contracts'
import type { Certificate } from '../store/profile-store.ts'

const kindOf = (field: PDFField): FormFieldKind => {
  if (field instanceof PDFTextField) return 'text'
  if (field instanceof PDFCheckBox) return 'checkbox'
  if (field instanceof PDFDropdown || field instanceof PDFOptionList) return 'dropdown'
  if (field instanceof PDFRadioGroup) return 'radio'
  if (field instanceof PDFSignature) return 'signature'
  return 'other'
}

const optionsOf = (field: PDFField): string[] => {
  if (field instanceof PDFDropdown || field instanceof PDFOptionList || field instanceof PDFRadioGroup) return field.getOptions()
  return []
}

/**
 * Lists a PDF's form fields.
 * @param content The PDF.
 * @returns The fields, in the form's order; empty for a PDF with no fields.
 */
export const readFormFields = async (content: Uint8Array): Promise<FormField[]> => {
  const document = await PDFDocument.load(content, { ignoreEncryption: true })
  return document
    .getForm()
    .getFields()
    .map((field) => ({ name: field.getName(), kind: kindOf(field), options: optionsOf(field) }))
}

const truthyAnswers = new Set(['x', 'yes', 'true', '1', 'on', 'ja', 'si', 'sì', 'oui', 'sí', 'checked'])

const applyValue = (field: PDFField, value: string): void => {
  if (field instanceof PDFTextField) field.setText(value)
  if (field instanceof PDFCheckBox) {
    if (truthyAnswers.has(value.trim().toLowerCase())) field.check()
    else field.uncheck()
  }
  if ((field instanceof PDFDropdown || field instanceof PDFOptionList) && field.getOptions().includes(value)) field.select(value)
  if (field instanceof PDFRadioGroup && field.getOptions().includes(value)) field.select(value)
}

const decodeDataUrl = (dataUrl: string): { bytes: Uint8Array; isPng: boolean } => {
  const [header, base64 = ''] = dataUrl.split(',')
  return { bytes: Buffer.from(base64, 'base64'), isPng: header?.includes('image/png') ?? false }
}

const drawSignatureImage = async (document: PDFDocument, signatureImage: string): Promise<void> => {
  const { bytes, isPng } = decodeDataUrl(signatureImage)
  const image = isPng ? await document.embedPng(bytes) : await document.embedJpg(bytes)
  const signatureWidget = document
    .getForm()
    .getFields()
    .filter((field) => field instanceof PDFSignature)
    .flatMap((field) => field.acroField.getWidgets())[0]
  const pages = document.getPages()
  const widgetPage = signatureWidget === undefined ? undefined : pages.find((page) => page.ref === signatureWidget.P())
  if (signatureWidget !== undefined && widgetPage !== undefined) {
    const rectangle = signatureWidget.getRectangle()
    const scaled = image.scaleToFit(rectangle.width, rectangle.height)
    widgetPage.drawImage(image, { x: rectangle.x, y: rectangle.y, width: scaled.width, height: scaled.height })
    return
  }
  const lastPage = pages.at(-1)
  if (lastPage === undefined) return
  const scaled = image.scaleToFit(160, 60)
  lastPage.drawImage(image, { x: lastPage.getWidth() - scaled.width - 48, y: 48, width: scaled.width, height: scaled.height })
}

export type FillOptions = {
  values: FieldSuggestion[]
  sign: { profile: Profile; certificate: Certificate; now: Date } | null
}

/**
 * Writes the reviewed values into the form. When signing, it flattens the form so the values
 * cannot change, draws the profile's signature image, and adds a digital signature
 * (ETSI.CAdES.detached) with the profile's certificate.
 * @param content The blank or partly filled PDF.
 * @param options The values and, to sign, the profile, its certificate and the time.
 * @returns The filled, and possibly signed, PDF.
 */
export const fillForm = async (content: Uint8Array, options: FillOptions): Promise<Uint8Array> => {
  const document = await PDFDocument.load(content, { ignoreEncryption: true })
  const form = document.getForm()
  const valuesByName = new Map(options.values.map((value) => [value.name, value.value]))
  form.getFields().forEach((field) => {
    const value = valuesByName.get(field.getName())
    if (value !== undefined && value !== '') applyValue(field, value)
  })

  if (options.sign === null) return document.save()

  const { profile, certificate, now } = options.sign
  if (profile.signatureImage !== null) await drawSignatureImage(document, profile.signatureImage)
  form.flatten()
  const signerName = `${profile.firstName} ${profile.lastName}`.trim() || profile.label
  pdflibAddPlaceholder({
    pdfDoc: document,
    reason: 'Signed with Offee',
    contactInfo: profile.email,
    name: signerName,
    location: profile.city,
    signingTime: now,
    subFilter: SUBFILTER_ETSI_CADES_DETACHED,
    appName: 'Offee',
  })
  const unsigned = await document.save({ useObjectStreams: false })
  const signer = new P12Signer(Buffer.from(certificate.p12Base64, 'base64'), { passphrase: certificate.passphrase })
  return new SignPdf().sign(Buffer.from(unsigned), signer, now)
}
