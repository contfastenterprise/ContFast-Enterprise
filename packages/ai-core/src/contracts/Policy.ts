export enum PolicyMode {
  Strict = "Strict",
  Audit = "Audit",
  Disabled = "Disabled"
}

export interface Policy {
  readonly id: string;
  readonly description: string;
  readonly enforcementLevel: PolicyMode;
}
