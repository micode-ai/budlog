import { DesignKind, DesignProviderKind } from '@prisma/client';

/** Input to a design action. The service resolves the plan attachment to bytes before calling
 *  the provider — providers never touch the DB or file store. */
export interface DesignInput {
  /** Base64-encoded plan image (no data: prefix), if a plan attachment was supplied. */
  planImageBase64?: string;
  /** MIME type of the plan image (e.g. image/png). */
  mimeType?: string;
  /** Free-text client requirements. */
  requirements?: string;
}

/** One produced artifact (a schema, an SVG, a render, or an external 3D link). */
export interface DesignResult {
  kind: DesignKind;
  provider: DesignProviderKind;
  data: unknown;
}

/** Provider-agnostic design generator. MVP impl = OpenAI Vision; Planner5d/Coohom plug in later. */
export interface DesignProvider {
  readonly name: DesignProviderKind;
  /** Produce one or more artifacts from the input. May return [] if nothing could be generated. */
  generate(input: DesignInput): Promise<DesignResult[]>;
}

/** Nest DI token so `DesignService` depends on the interface, not a concrete provider. */
export const DESIGN_PROVIDER = Symbol('DESIGN_PROVIDER');
