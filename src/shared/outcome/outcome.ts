/**
 * Envelope returned by aggregate transitions. Pairs the new aggregate state
 * with the domain events the transition produced. Empty `events` is allowed
 * for transitions that mutate state without publishing.
 */
export interface Outcome<A, E> {
  readonly aggregate: A;
  readonly events: readonly E[];
}
