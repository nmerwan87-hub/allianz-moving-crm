import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components"
import * as React from "react"

interface PlatformEmailVerificationProps {
  companyName: string
  ownerName: string
  confirmationUrl: string
}

export function PlatformEmailVerification({
  companyName,
  ownerName,
  confirmationUrl,
}: PlatformEmailVerificationProps) {
  return (
    <Html>
      <Head />
      <Preview>Confirm your email to complete your Bivro registration</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={logo}>Bivro</Heading>
          <Hr style={divider} />
          <Heading style={h1}>Confirm your email address</Heading>
          {ownerName ? <Text style={text}>Hi {ownerName},</Text> : null}
          <Text style={text}>
            Thanks for registering <strong>{companyName}</strong> on Bivro. Please confirm your
            email address to complete your registration.
          </Text>
          <Section style={buttonSection}>
            <Button href={confirmationUrl} style={button}>
              Confirm my email
            </Button>
          </Section>
          <Text style={subtext}>This link expires in 24 hours.</Text>
          <Text style={subtext}>
            If you did not create a Bivro account, you can safely ignore this email.
          </Text>
          <Hr style={divider} />
          <Text style={footer}>© 2026 Bivro. All rights reserved.</Text>
        </Container>
      </Body>
    </Html>
  )
}

export default PlatformEmailVerification

const main: React.CSSProperties = {
  backgroundColor: "#f8fafc",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
}

const container: React.CSSProperties = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "40px 32px",
  maxWidth: "560px",
  borderRadius: "8px",
  border: "1px solid #e2e8f0",
}

const logo: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: "600",
  color: "#0f172a",
  margin: "0 0 24px",
  letterSpacing: "-0.025em",
}

const h1: React.CSSProperties = {
  fontSize: "24px",
  fontWeight: "700",
  color: "#0f172a",
  margin: "24px 0 16px",
}

const text: React.CSSProperties = {
  fontSize: "14px",
  color: "#475569",
  lineHeight: "1.6",
  margin: "0 0 16px",
}

const buttonSection: React.CSSProperties = {
  textAlign: "center",
  margin: "24px 0",
}

const button: React.CSSProperties = {
  backgroundColor: "#0f172a",
  color: "#ffffff",
  padding: "12px 24px",
  borderRadius: "6px",
  fontSize: "14px",
  fontWeight: "600",
  textDecoration: "none",
  display: "inline-block",
}

const subtext: React.CSSProperties = {
  fontSize: "12px",
  color: "#94a3b8",
  lineHeight: "1.6",
  margin: "0 0 8px",
}

const divider: React.CSSProperties = {
  borderColor: "#e2e8f0",
  margin: "24px 0",
}

const footer: React.CSSProperties = {
  fontSize: "11px",
  color: "#94a3b8",
  margin: "0",
}
