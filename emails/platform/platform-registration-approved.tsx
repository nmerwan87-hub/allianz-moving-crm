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

interface PlatformRegistrationApprovedProps {
  companyName: string
  ownerName: string
  loginUrl: string
}

export function PlatformRegistrationApproved({
  companyName,
  ownerName,
  loginUrl,
}: PlatformRegistrationApprovedProps) {
  return (
    <Html>
      <Head />
      <Preview>Your Bivro account is approved — welcome aboard</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={logo}>Bivro</Heading>
          <Hr style={divider} />
          <Heading style={h1}>Welcome to Bivro, {ownerName} 🎉</Heading>
          <Text style={text}>
            Your application for <strong>{companyName}</strong> has been approved. Your account is
            ready.
          </Text>
          <Section style={trialBanner}>
            <Text style={trialText}>
              <strong>Your 14-day free trial starts today.</strong> No credit card required.
            </Text>
          </Section>
          <Text style={text}>Log in to set up your workspace:</Text>
          <Section style={buttonSection}>
            <Button href={loginUrl} style={button}>
              Log in to your dashboard
            </Button>
          </Section>
          <Text style={subheading}>Getting started</Text>
          <Text style={text}>
            After logging in, a short onboarding wizard will guide you through:
          </Text>
          <ul style={list}>
            <li style={listItem}>Setting up your company profile and branding</li>
            <li style={listItem}>Configuring your hourly rates and pricing</li>
            <li style={listItem}>Adding your first service</li>
            <li style={listItem}>Setting up bank details for invoices</li>
            <li style={listItem}>Inviting your team</li>
          </ul>
          <Text style={text}>
            Questions? We&apos;re here at{" "}
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

export default PlatformRegistrationApproved

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

const trialBanner: React.CSSProperties = {
  backgroundColor: "#f0fdf4",
  border: "1px solid #bbf7d0",
  borderRadius: "6px",
  padding: "12px 16px",
  margin: "0 0 24px",
}

const trialText: React.CSSProperties = {
  fontSize: "14px",
  color: "#166534",
  margin: "0",
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

const subheading: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: "600",
  color: "#0f172a",
  margin: "24px 0 8px",
}

const list: React.CSSProperties = {
  margin: "0 0 16px",
  paddingLeft: "20px",
}

const listItem: React.CSSProperties = {
  fontSize: "14px",
  color: "#475569",
  lineHeight: "1.8",
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
