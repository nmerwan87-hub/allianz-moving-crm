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

interface PlatformRegistrationMoreInfoNeededProps {
  companyName: string
  ownerName: string
  requestMessage: string
}

export function PlatformRegistrationMoreInfoNeeded({
  companyName,
  ownerName,
  requestMessage,
}: PlatformRegistrationMoreInfoNeededProps) {
  return (
    <Html>
      <Head />
      <Preview>Action required: additional information needed for your Bivro application</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={logo}>Bivro</Heading>
          <Hr style={divider} />
          <Heading style={h1}>Additional information needed</Heading>
          <Text style={text}>Hi {ownerName},</Text>
          <Text style={text}>
            Your application for <strong>{companyName}</strong> is under review.
          </Text>
          <Text style={text}>
            We need a little more information before we can proceed:
          </Text>
          <Section style={infoBox}>
            <Text style={infoText}>{requestMessage}</Text>
          </Section>
          <Text style={text}>
            Please reply to this email with the requested information and we&apos;ll continue the review
            process.
          </Text>
          <Text style={text}>
            If you have questions, contact us at{" "}
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

export default PlatformRegistrationMoreInfoNeeded

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
  backgroundColor: "#fffbeb",
  border: "1px solid #fcd34d",
  borderRadius: "6px",
  padding: "16px",
  margin: "0 0 24px",
}

const infoText: React.CSSProperties = {
  fontSize: "14px",
  color: "#92400e",
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
