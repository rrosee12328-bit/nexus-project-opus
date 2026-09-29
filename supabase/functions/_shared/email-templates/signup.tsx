/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({
  siteName,
  siteUrl,
  recipient,
  confirmationUrl,
}: SignupEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Confirm your email for your Vektiss workspace</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>VEKTISS</Text>
        <Heading style={h1}>Confirm your workspace email</Heading>
        <Text style={text}>
          Confirm that (
          <Link href={`mailto:${recipient}`} style={link}>
            {recipient}
          </Link>
          ) is the email connected to your Vektiss client workspace.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Confirm Email
        </Button>
        <Text style={footer}>
          If you didn't create an account, you can safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail

const main = { backgroundColor: '#080a0d', fontFamily: "'Inter', Arial, sans-serif", padding: '32px 16px' }
const container = { padding: '32px 28px', backgroundColor: '#111419', border: '1px solid #242a33', borderRadius: '16px' }
const brand = { color: '#3291ff', fontSize: '12px', fontWeight: '700' as const, letterSpacing: '3px', margin: '0 0 24px' }
const h1 = {
  fontSize: '24px',
  fontWeight: 'bold' as const,
  color: '#ffffff',
  margin: '0 0 20px',
}
const text = {
  fontSize: '14px',
  color: '#aab2bf',
  lineHeight: '1.6',
  margin: '0 0 25px',
}
const link = { color: '#3291ff', textDecoration: 'underline' }
const button = {
  backgroundColor: '#2588ff',
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: '600' as const,
  borderRadius: '6px',
  padding: '12px 24px',
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: '#6f7887', margin: '30px 0 0' }
