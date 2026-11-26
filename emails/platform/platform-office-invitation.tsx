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

interface PlatformOfficeInvitationProps {
  companyName: string
  inviterName: string
  inviteUrl: string
  expiresAt: string
}

export function PlatformOfficeInvitation({
  companyName,
  inviterName,
  inviteUrl,
  expiresAt,
}: PlatformOfficeInvitationProps) {
  return (
    <Html>
      <Head />
      <Preview>Einladung: {companyName} in Bivro</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={logo}>Bivro</Heading>
          <Hr style={divider} />
          <Heading style={h1}>Sie sind eingeladen</Heading>
          <Text style={text}>
            <strong>{inviterName}</strong> lädt Sie ein, bei <strong>{companyName}</strong> in
            Bivro mitzuarbeiten.
          </Text>
          <Text style={text}>
            In Bivro verwaltet {companyName} Anfragen, Offerten, Aufträge und Rechnungen.
          </Text>
          <Section style={buttonSection}>
            <Button href={inviteUrl} style={button}>
              Einladung annehmen
            </Button>
          </Section>
          <Text style={subtext}>
            Die Einladung ist gültig bis <strong>{expiresAt}</strong>.
          </Text>
          <Text style={subtext}>
            Falls Sie diese Einladung nicht erwartet haben, können Sie diese E-Mail ignorieren. Ohne
            Klick auf den Knopf wird kein Konto erstellt.
          </Text>
          <Hr style={divider} />
          <Text style={footer}>© 2026 Bivro</Text>
        </Container>
      </Body>
    </Html>
  )
}

export default PlatformOfficeInvitation

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
