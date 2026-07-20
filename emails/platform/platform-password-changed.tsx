import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Text,
} from "@react-email/components"
import * as React from "react"

interface PlatformPasswordChangedProps {
  email: string
  changedAt: string
}

export function PlatformPasswordChanged({ email, changedAt }: PlatformPasswordChangedProps) {
  return (
    <Html>
      <Head />
      <Preview>Your Bivro password has been changed</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={logo}>Bivro</Heading>
          <Hr style={divider} />
          <Heading style={h1}>Password changed</Heading>
          <Text style={text}>
            The password for your Bivro account (<strong>{email}</strong>) was changed on{" "}
            {changedAt}.
          </Text>
          <Text style={text}>
            If you made this change, no further action is needed.
          </Text>
          <Text style={text}>
            If you did not make this change, please contact us immediately at{" "}
            <a href="mailto:support@bivro.io" style={link}>
              support@bivro.io
            </a>{" "}
            or reset your password.
          </Text>
          <Hr style={divider} />
          <Text style={footer}>© 2026 Bivro. All rights reserved.</Text>
        </Container>
      </Body>
    </Html>
  )
}

export default PlatformPasswordChanged

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
