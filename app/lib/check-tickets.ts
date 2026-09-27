import { randomUUID } from "node:crypto";

// Ties one AI analysis call (POST /api/analyze-smart) to one consumed check
// quota unit (POST /api/usage/consume). Without this, a client could call
// consume once and then call analyze-smart an unbounded number of times,
// running up real OpenAI costs disconnected from the quota meant to gate
// them. In-memory + short-lived - same single-instance-deployment
// tradeoff as app/lib/rate-limit.ts.
const TICKET_TTL_MS = 5 * 60_000;

type Ticket = { subject: string; expiresAt: number };
const tickets = new Map<string, Ticket>();

function pruneExpired(): void {
  const now = Date.now();
  for (const [id, ticket] of tickets) {
    if (now > ticket.expiresAt) tickets.delete(id);
  }
}

/** Issues a one-shot ticket for `subject`, valid for TICKET_TTL_MS. */
export function issueCheckTicket(subject: string): string {
  pruneExpired();
  const id = randomUUID();
  tickets.set(id, { subject, expiresAt: Date.now() + TICKET_TTL_MS });
  return id;
}

/**
 * Validates and one-shot-consumes a ticket (deleted whether it's valid or
 * not, so it can never be reused). Returns false if missing, expired, or
 * issued to a different subject than the one presenting it.
 */
export function consumeCheckTicket(ticketId: string | undefined | null, subject: string): boolean {
  if (!ticketId) return false;
  const ticket = tickets.get(ticketId);
  tickets.delete(ticketId);
  if (!ticket) return false;
  if (ticket.subject !== subject) return false;
  if (Date.now() > ticket.expiresAt) return false;
  return true;
}
