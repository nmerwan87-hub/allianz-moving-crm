declare const brand: unique symbol

type Brand<T, B> = T & { readonly [brand]: B }

export type CompanyId = Brand<string, "CompanyId">
export type ProfileId = Brand<string, "ProfileId">
export type CustomerId = Brand<string, "CustomerId">
export type LeadId = Brand<string, "LeadId">
export type AppointmentId = Brand<string, "AppointmentId">
export type QuoteId = Brand<string, "QuoteId">
export type QuoteItemId = Brand<string, "QuoteItemId">
export type QuoteVersionId = Brand<string, "QuoteVersionId">
export type JobId = Brand<string, "JobId">
export type JobAssignmentId = Brand<string, "JobAssignmentId">
export type InvoiceId = Brand<string, "InvoiceId">
export type InvoiceItemId = Brand<string, "InvoiceItemId">
export type PaymentId = Brand<string, "PaymentId">
export type DocumentId = Brand<string, "DocumentId">
export type DocumentTemplateId = Brand<string, "DocumentTemplateId">
export type EmployeeId = Brand<string, "EmployeeId">
export type VehicleId = Brand<string, "VehicleId">
export type PermissionGroupId = Brand<string, "PermissionGroupId">
export type InvitationId = Brand<string, "InvitationId">
export type TaskId = Brand<string, "TaskId">
export type NotificationId = Brand<string, "NotificationId">
export type EmailLogId = Brand<string, "EmailLogId">
export type AiLogId = Brand<string, "AiLogId">
export type ActivityLogId = Brand<string, "ActivityLogId">
export type DomainEventId = Brand<string, "DomainEventId">
export type EmailTemplateId = Brand<string, "EmailTemplateId">
export type EmailTemplateVersionId = Brand<string, "EmailTemplateVersionId">
export type EmailAutomationId = Brand<string, "EmailAutomationId">
export type EmailSenderIdentityId = Brand<string, "EmailSenderIdentityId">

export type UserRole = "owner" | "office"

export function asCompanyId(id: string): CompanyId {
  return id as CompanyId
}

export function asProfileId(id: string): ProfileId {
  return id as ProfileId
}
