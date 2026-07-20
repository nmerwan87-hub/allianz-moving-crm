import {
  Body,
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

interface PlatformRegistrationReceivedProps {
  companyName: string
  ownerName: string
}

export function PlatformRegistrationReceived({
  companyName,
  ownerName,
}: PlatformRegistrationReceivedProps) {
  return (
    <Html>
      <Head />
      <Preview>We&apos;ve received your Bivro application — under review</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={logo}>Bivro</Heading>
          <Hr style={divider} />
          <Heading style={h1}>Application received</Heading>
          <Text style={text}>Hi {ownerName},</Text>
          <Text style={text}>
            Your email has been verified. Your application for{" "}
            <strong>{companyName}</strong> is now under review.
          </Text>
          <Section style={infoBox}>
            <Text style={infoText}>
              We review all applications within <strong>1 business day</strong>. You&apos;ll receive an
              email once a decision has been made.
            </Text>
          </Section>
          <Text style={text}>
            If you have questions in the meantime, contact us at{" "}
            <a href="mailto:support@bivro.io" style={link}>
              support@bivro.io
            </a>
            .
          </Text>
          <Hr style={divider} />
          <Text style={footer}>© 2026 Bivro. All rights reserved.</Text>
        </Container>
      </Body>
    </Html>
  )
}

export default PlatformRegistrationReceived

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

const infoBox: React.CSSProperties = {
  backgroundColor: "#f1f5f9",
  borderRadius: "6px",
  padding: "16px",
  margin: "16px 0 24px",
}

const infoText: React.CSSProperties = {
  fontSize: "14px",
  color: "#334155",
  lineHeight: "1.6",
  margin: "0",
}

const link: React.CSSProperties = {
  color: "#7c3aed",
  textDecoration: "underline",
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
