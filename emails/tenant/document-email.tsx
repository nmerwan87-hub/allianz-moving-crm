import { Body, Button, Container, Head, Hr, Html, Preview, Text } from "@react-email/components"
import * as React from "react"

export interface DocumentEmailProps {
  greeting: string
  body: string
  /** e.g. validity of a quote or due date of an invoice */
  note?: string | null
  personalMessage: string | null
  closing: string
  companyName: string
  companyContact: string
  accentColor: string
  /** Link to the customer portal (view, accept, pay) */
  action?: { url: string; label: string } | null
}

/**
 * Sent in the name of the moving company (not Bivro): documents with the PDF
 * attached (quote, invoice, reminder) and the automatic e-mails. Blank lines
 * in the body start a new paragraph.
 */
export function DocumentEmail(props: DocumentEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{props.body}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={{ ...brand, color: props.accentColor }}>{props.companyName}</Text>
          <Hr style={divider} />
          <Text style={text}>{props.greeting}</Text>
          {props.body.split(/\n\s*\n/).map((paragraph, i) => (
            <Text key={`p${i}`} style={text}>
              {paragraph}
            </Text>
          ))}
          {props.personalMessage &&
            props.personalMessage.split(/\r?\n/).map((line, i) => (
              <Text key={i} style={text}>
                {line}
              </Text>
            ))}
          {props.note && <Text style={text}>{props.note}</Text>}
          {props.action && (
            <Button
              href={props.action.url}
              style={{ ...button, backgroundColor: props.accentColor }}
            >
              {props.action.label}
            </Button>
          )}
          <Text style={text}>
            {props.closing}
            <br />
            {props.companyName}
          </Text>
          <Hr style={divider} />
          <Text style={footer}>{props.companyContact}</Text>
        </Container>
      </Body>
    </Html>
  )
}

const main = { backgroundColor: "#f6f6f4", fontFamily: "Helvetica, Arial, sans-serif" }
const container = { backgroundColor: "#ffffff", margin: "24px auto", padding: "32px", maxWidth: "560px" }
const brand = { fontSize: "18px", fontWeight: 700, margin: 0 }
const divider = { borderColor: "#e5e7eb", margin: "20px 0" }
const text = { fontSize: "14px", lineHeight: "22px", color: "#1f2937", margin: "0 0 12px" }
const button = {
  display: "inline-block",
  color: "#ffffff",
  fontSize: "14px",
  fontWeight: 600,
  padding: "12px 20px",
  borderRadius: "6px",
  textDecoration: "none",
  margin: "4px 0 20px",
}
const footer = { fontSize: "12px", color: "#6b7280", margin: 0 }
