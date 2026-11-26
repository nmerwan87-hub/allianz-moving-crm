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
      <Preview>Ihr Bivro-Passwort wurde geändert</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={logo}>Bivro</Heading>
          <Hr style={divider} />
          <Heading style={h1}>Passwort geändert</Heading>
          <Text style={text}>
            Das Passwort Ihres Bivro-Kontos (<strong>{email}</strong>) wurde am {changedAt}{" "}
            geändert.
          </Text>
          <Text style={text}>
            Wenn Sie das selbst waren, müssen Sie nichts tun.
          </Text>
          <Text style={text}>
            Wenn nicht, setzen Sie Ihr Passwort sofort zurück und melden Sie sich bei{" "}
            <a href="mailto:support@bivro.io" style={link}>
              support@bivro.io
            </a>
            .
          </Text>
          <Hr style={divider} />
          <Text style={footer}>© 2026 Bivro</Text>
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
