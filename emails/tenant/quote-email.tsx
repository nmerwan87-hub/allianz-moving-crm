import { Body, Container, Head, Hr, Html, Preview, Text } from "@react-email/components"
import * as React from "react"

export interface QuoteEmailProps {
  greeting: string
  body: string
  validity: string
  personalMessage: string | null
  closing: string
  companyName: string
  companyContact: string
  accentColor: string
}

/** Sent in the name of the moving company (not Bivro), with the quote PDF attached. */
export function QuoteEmail(props: QuoteEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{props.body}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={{ ...brand, color: props.accentColor }}>{props.companyName}</Text>
          <Hr style={divider} />
          <Text style={text}>{props.greeting}</Text>
          <Text style={text}>{props.body}</Text>
          {props.personalMessage &&
            props.personalMessage.split(/\r?\n/).map((line, i) => (
              <Text key={i} style={text}>
                {line}
              </Text>
            ))}
          <Text style={text}>{props.validity}</Text>
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
const footer = { fontSize: "12px", color: "#6b7280", margin: 0 }
