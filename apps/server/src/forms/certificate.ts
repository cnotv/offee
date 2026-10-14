import { randomBytes } from 'node:crypto'
import forge from 'node-forge'
import type { Profile } from '@offee/contracts'
import type { Certificate } from '../store/profile-store.ts'

const validityInYears = 3

/**
 * Creates a self-signed signing certificate for a profile, packed as PKCS#12 with a random
 * passphrase. It proves a document was not changed after signing and who held the key; it is
 * not a qualified certificate.
 * @param profile The profile it identifies.
 * @param now The current time.
 * @returns The certificate and its passphrase.
 */
export const createSigningCertificate = (profile: Profile, now: Date): Certificate => {
  const keys = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 })
  const certificate = forge.pki.createCertificate()
  certificate.publicKey = keys.publicKey
  certificate.serialNumber = `01${randomBytes(15).toString('hex')}`
  certificate.validity.notBefore = now
  certificate.validity.notAfter = new Date(now.getTime() + validityInYears * 365 * 24 * 60 * 60 * 1000)

  const commonName = `${profile.firstName} ${profile.lastName}`.trim() || profile.label
  const attributes = [
    { name: 'commonName', value: commonName },
    ...(profile.organization === '' ? [] : [{ name: 'organizationName', value: profile.organization }]),
    ...(profile.email === '' ? [] : [{ name: 'emailAddress', value: profile.email }]),
  ]
  certificate.setSubject(attributes)
  certificate.setIssuer(attributes)
  certificate.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, nonRepudiation: true },
    { name: 'extKeyUsage', emailProtection: true },
  ])
  certificate.sign(keys.privateKey, forge.md.sha256.create())

  const passphrase = randomBytes(24).toString('hex')
  const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [certificate], passphrase, { algorithm: '3des', friendlyName: commonName })
  return { p12Base64: forge.util.encode64(forge.asn1.toDer(p12).getBytes()), passphrase }
}
